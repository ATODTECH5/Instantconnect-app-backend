import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
	ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, MoreThan, Repository } from 'typeorm';

import {
	PageInfoDto,
	type PaginationQueryDto,
} from '../common/dto/pagination.dto';
import { Event, ExternalEventSource } from '../events/entities/event.entity';
import {
	EventbriteOrganizerDto,
	EventbriteOrganizerPageDto,
} from './dto/eventbrite-organizer.dto';
import { EventbriteOrganizer } from './entities/eventbrite-organizer.entity';
import { EventbriteClient } from './eventbrite.client';
import { ExternalEventsService } from './external-events.service';

/** A bare id, or the id at the end of an eventbrite.<tld>/o/<slug>-<id> link. */
const BARE_ID = /^\d{5,20}$/;
const PAGE_LINK = /eventbrite\.[a-z.]+\/o\/(?:[^/?#]*-)?(\d{5,20})(?:[/?#]|$)/i;

@Injectable()
export class EventbriteOrganizersService {
	constructor(
		@InjectRepository(EventbriteOrganizer)
		private readonly organizers: Repository<EventbriteOrganizer>,
		@InjectRepository(Event)
		private readonly events: Repository<Event>,
		private readonly dataSource: DataSource,
		private readonly eventbrite: EventbriteClient,
		private readonly sync: ExternalEventsService,
	) {}

	async list(query: PaginationQueryDto): Promise<EventbriteOrganizerPageDto> {
		// Counted apart: findAndCount with a partial relation select counts
		// distinct adders rather than organizers.
		const [rows, total] = await Promise.all([
			this.organizers.find({
				relations: { addedBy: true },
				select: { addedBy: { id: true, fullName: true } },
				// The seeded organizers share a createdAt, so paging needs a tie-break.
				order: { createdAt: 'ASC', organizerId: 'ASC' },
				take: query.limit,
				skip: query.offset,
			}),
			this.organizers.count(),
		]);
		const counts = await this.upcomingCounts(
			rows.map((row) => row.organizerId),
		);

		return new EventbriteOrganizerPageDto(
			{
				tokenConfigured: this.eventbrite.isConfigured,
				isSyncing: this.sync.isSyncing,
			},
			rows.map(
				(row) =>
					new EventbriteOrganizerDto(
						row,
						counts.get(row.organizerId) ?? 0,
					),
			),
			new PageInfoDto(total, query),
		);
	}

	/**
	 * Asks Eventbrite first, so a typo can never be saved, then imports the
	 * organizer's events in the background so they appear without waiting
	 * for the next scheduled run.
	 */
	async add(adminId: string, input: string): Promise<EventbriteOrganizerDto> {
		this.assertConfigured();

		const organizerId = this.parseOrganizerId(input);

		if (await this.organizers.exists({ where: { organizerId } })) {
			throw new ConflictException({
				code: 'ORGANIZER_ALREADY_ADDED',
				message: 'That organizer is already on the list.',
			});
		}

		const name = await this.eventbrite.findOrganizerName(organizerId);

		if (!name) {
			throw new BadRequestException({
				code: 'ORGANIZER_NOT_FOUND',
				message: 'Eventbrite has no organizer with that link.',
			});
		}

		const saved = await this.organizers.save(
			this.organizers.create({ organizerId, name, addedById: adminId }),
		);

		void this.sync.syncOrganizer(saved);

		return this.findOne(saved.id);
	}

	async setActive(
		id: string,
		isActive: boolean,
	): Promise<EventbriteOrganizerDto> {
		const organizer = await this.findEntity(id);

		await this.organizers.update(organizer.id, { isActive });

		if (isActive && this.eventbrite.isConfigured) {
			void this.sync.syncOrganizer(organizer);
		}

		return this.findOne(id);
	}

	/**
	 * Its upcoming events go with it, attendance included; events that have
	 * already happened stay so members keep their history.
	 */
	async remove(id: string): Promise<void> {
		const organizer = await this.findEntity(id);

		await this.dataSource.transaction(async (manager) => {
			await manager.getRepository(Event).delete({
				externalSource: ExternalEventSource.Eventbrite,
				externalOrganizerId: organizer.organizerId,
				startsAt: MoreThan(new Date()),
			});
			await manager
				.getRepository(EventbriteOrganizer)
				.delete(organizer.id);
		});
	}

	/** Answers at once; the dashboard watches `isSyncing` and `lastSyncedAt`. */
	syncAll(): void {
		this.assertConfigured();

		void this.sync.syncEventbrite();
	}

	private async findOne(id: string): Promise<EventbriteOrganizerDto> {
		const organizer = await this.organizers.findOne({
			where: { id },
			relations: { addedBy: true },
			select: { addedBy: { id: true, fullName: true } },
		});

		if (!organizer) throw this.notFound();

		const counts = await this.upcomingCounts([organizer.organizerId]);

		return new EventbriteOrganizerDto(
			organizer,
			counts.get(organizer.organizerId) ?? 0,
		);
	}

	private async findEntity(id: string): Promise<EventbriteOrganizer> {
		const organizer = await this.organizers.findOne({ where: { id } });

		if (!organizer) throw this.notFound();

		return organizer;
	}

	private async upcomingCounts(
		organizerIds: string[],
	): Promise<Map<string, number>> {
		if (organizerIds.length === 0) return new Map();

		const rows = await this.events
			.createQueryBuilder('event')
			.select('event.externalOrganizerId', 'organizerId')
			.addSelect('COUNT(*)', 'count')
			.where('event.externalSource = :source', {
				source: ExternalEventSource.Eventbrite,
			})
			.andWhere({ externalOrganizerId: In(organizerIds) })
			.andWhere('COALESCE(event.endsAt, event.startsAt) >= now()')
			.groupBy('event.externalOrganizerId')
			.getRawMany<{ organizerId: string; count: string }>();

		return new Map(rows.map((row) => [row.organizerId, Number(row.count)]));
	}

	private parseOrganizerId(input: string): string {
		const organizerId = BARE_ID.test(input)
			? input
			: PAGE_LINK.exec(input)?.[1];

		if (!organizerId) {
			throw new BadRequestException({
				code: 'INVALID_ORGANIZER',
				message:
					'Paste an organizer page link (eventbrite.com/o/...) or the number at its end.',
			});
		}

		return organizerId;
	}

	private assertConfigured(): void {
		if (!this.eventbrite.isConfigured) {
			throw new ServiceUnavailableException({
				code: 'EVENTBRITE_NOT_CONFIGURED',
				message:
					'EVENTBRITE_TOKEN is not set on the server, so nothing can be imported.',
			});
		}
	}

	private notFound(): NotFoundException {
		return new NotFoundException({
			code: 'ORGANIZER_NOT_FOUND',
			message: 'That organizer is no longer on the list.',
		});
	}
}
