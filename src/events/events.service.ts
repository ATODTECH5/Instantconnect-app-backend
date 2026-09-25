import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
	DataSource,
	In,
	IsNull,
	LessThan,
	MoreThanOrEqual,
	Repository,
} from 'typeorm';

import { PageInfoDto } from '../common/dto/pagination.dto';
import { ChatGateway } from '../chat/chat.gateway';
import { ConnectionsService } from '../connections/connections.service';
import { NotificationKind } from '../notifications/entities/notification-kind.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { Category } from '../reference/entities/category.entity';
import { Storage, type UploadSignature } from '../storage/storage';
import { AVATAR_POSITION } from '../users/entities/user-photo.entity';
import type { User } from '../users/entities/user.entity';
import {
	type CreateEventDto,
	EventDetailDto,
	EventPageDto,
	EventPersonDto,
	EventSummaryDto,
	EventTimeframe,
	INVITEE_PREVIEW,
	type ListMyEventsQueryDto,
	RecentVenueDto,
} from './dto/event.dto';
import { EventInvite } from './entities/event-invite.entity';
import { Event } from './entities/event.entity';

const RECENT_VENUES = 5;

/**
 * Enough rows to find {@link RECENT_VENUES} distinct places for someone who
 * hosts at the same venue over and over, without reading their whole history.
 */
const RECENT_VENUE_SCAN = 30;

const PERSON_SELECT = {
	id: true,
	fullName: true,
	kycStatus: true,
	photos: { position: true, storageId: true },
} as const;

@Injectable()
export class EventsService {
	private readonly logger = new Logger(EventsService.name);

	constructor(
		@InjectRepository(Event)
		private readonly events: Repository<Event>,
		@InjectRepository(EventInvite)
		private readonly invites: Repository<EventInvite>,
		@InjectRepository(Category)
		private readonly categories: Repository<Category>,
		private readonly dataSource: DataSource,
		private readonly storage: Storage,
		private readonly connections: ConnectionsService,
		private readonly notifications: NotificationsService,
		private readonly gateway: ChatGateway,
	) {}

	createCoverUploadSignature(hostId: string): UploadSignature {
		return this.storage.createUploadSignature(
			this.storage.buildEventCoverStorageId(hostId),
		);
	}

	async create(
		hostId: string,
		input: CreateEventDto,
	): Promise<EventDetailDto> {
		const startsAt = new Date(input.startsAt);
		const endsAt = input.endsAt ? new Date(input.endsAt) : null;
		const inviteeIds = input.inviteeIds ?? [];

		this.assertSchedule(startsAt, endsAt);

		await Promise.all([
			this.assertCategory(input.categoryId),
			this.assertCover(hostId, input.coverStorageId),
			this.assertInvitable(hostId, inviteeIds),
		]);

		const eventId = await this.dataSource.transaction(async (manager) => {
			const events = manager.getRepository(Event);
			const saved = await events.save(
				events.create({
					hostId,
					title: input.title,
					description: input.description || null,
					startsAt,
					endsAt,
					venueName: input.venue.name,
					venueAddress: input.venue.address || null,
					venueLocation: {
						type: 'Point',
						coordinates: [
							input.venue.longitude,
							input.venue.latitude,
						],
					},
					categoryId: input.categoryId ?? null,
					priceMinor: input.priceMinor,
					isPublic: input.isPublic,
					coverStorageId: input.coverStorageId ?? null,
				}),
			);

			if (inviteeIds.length > 0) {
				const invites = manager.getRepository(EventInvite);

				await invites.save(
					inviteeIds.map((userId) =>
						invites.create({ eventId: saved.id, userId }),
					),
				);
			}

			return saved.id;
		});

		await this.notifyInvitees(hostId, eventId, inviteeIds);

		return this.findOne(hostId, eventId);
	}

	async listMine(
		hostId: string,
		query: ListMyEventsQueryDto,
	): Promise<EventPageDto> {
		const now = new Date();
		const isUpcoming = query.when === EventTimeframe.Upcoming;

		// An event under way stays upcoming until it ends, so the host can still
		// reach it from the list while it is running.
		const [rows, total] = await this.events.findAndCount({
			where: isUpcoming
				? [
						{ hostId, startsAt: MoreThanOrEqual(now) },
						{ hostId, endsAt: MoreThanOrEqual(now) },
					]
				: [
						{ hostId, startsAt: LessThan(now), endsAt: IsNull() },
						{ hostId, endsAt: LessThan(now) },
					],
			relations: { category: true },
			order: { startsAt: isUpcoming ? 'ASC' : 'DESC' },
			take: query.limit,
			skip: query.offset,
		});

		const invitesByEvent = await this.invitesFor(rows.map((row) => row.id));

		return new EventPageDto(
			rows.map((row) => {
				const invitees = invitesByEvent.get(row.id) ?? [];

				return new EventSummaryDto(
					row,
					this.coverUrl(row),
					invitees.length,
					invitees
						.slice(0, INVITEE_PREVIEW)
						.map((user) => this.toPerson(user)),
				);
			}),
			new PageInfoDto(total, query),
		);
	}

	/**
	 * A private event reads as missing to anyone but its host and invitees,
	 * rather than as forbidden, so its existence is not disclosed either.
	 */
	async findOne(viewerId: string, id: string): Promise<EventDetailDto> {
		const event = await this.events.findOne({
			where: { id },
			relations: { category: true, host: { photos: true } },
			select: {
				id: true,
				createdAt: true,
				hostId: true,
				title: true,
				description: true,
				startsAt: true,
				endsAt: true,
				venueName: true,
				venueAddress: true,
				venueLocation: true,
				categoryId: true,
				priceMinor: true,
				isPublic: true,
				coverStorageId: true,
				category: { id: true, label: true },
				host: PERSON_SELECT,
			},
		});

		if (!event) throw this.notFound();

		const isHost = event.hostId === viewerId;
		const invitees =
			(await this.invitesFor([event.id])).get(event.id) ?? [];
		const isInvited = invitees.some((user) => user.id === viewerId);

		if (!event.isPublic && !isHost && !isInvited) throw this.notFound();

		return new EventDetailDto(
			event,
			this.coverUrl(event),
			this.toPerson(event.host),
			isHost,
			isHost ? invitees.map((user) => this.toPerson(user)) : [],
			invitees.length,
		);
	}

	async recentVenues(hostId: string): Promise<RecentVenueDto[]> {
		const rows = await this.events.find({
			where: { hostId },
			select: {
				id: true,
				venueName: true,
				venueAddress: true,
				venueLocation: true,
			},
			order: { createdAt: 'DESC' },
			take: RECENT_VENUE_SCAN,
		});

		const seen = new Set<string>();
		const venues: RecentVenueDto[] = [];

		for (const row of rows) {
			const key = `${row.venueName}|${row.venueAddress ?? ''}`;

			if (seen.has(key)) continue;

			seen.add(key);
			venues.push(new RecentVenueDto(row));

			if (venues.length === RECENT_VENUES) break;
		}

		return venues;
	}

	private assertSchedule(startsAt: Date, endsAt: Date | null): void {
		if (startsAt.getTime() <= Date.now()) {
			throw new BadRequestException({
				code: 'EVENT_START_IN_PAST',
				message: 'Pick a start time in the future.',
			});
		}

		if (endsAt && endsAt.getTime() <= startsAt.getTime()) {
			throw new BadRequestException({
				code: 'EVENT_END_BEFORE_START',
				message: 'The end time must be after the start time.',
			});
		}
	}

	private async assertCategory(
		categoryId: string | undefined,
	): Promise<void> {
		if (!categoryId) return;

		const exists = await this.categories.exists({
			where: { id: categoryId, isActive: true },
		});

		if (!exists) {
			throw new BadRequestException({
				code: 'CATEGORY_NOT_FOUND',
				message: 'That category is not available.',
			});
		}
	}

	/**
	 * The id must be one this host was signed for and the upload must have
	 * finished, so an event can never point at someone else's image or at
	 * nothing.
	 */
	private async assertCover(
		hostId: string,
		storageId: string | undefined,
	): Promise<void> {
		if (!storageId) return;

		if (!this.storage.isEventCoverStorageId(storageId, hostId)) {
			throw new BadRequestException({
				code: 'UPLOAD_NOT_OWNED',
				message: 'That cover photo does not belong to this event.',
			});
		}

		if (!(await this.storage.findAsset(storageId))) {
			throw new BadRequestException({
				code: 'UPLOAD_NOT_FOUND',
				message:
					'The cover photo upload did not complete. Please try again.',
			});
		}
	}

	/**
	 * Invitations are for accepted connections only, so an event can never be
	 * used to reach a stranger who has not agreed to hear from the host.
	 */
	private async assertInvitable(
		hostId: string,
		inviteeIds: string[],
	): Promise<void> {
		if (inviteeIds.length === 0) return;

		const states = await this.connections.statesFor(hostId, inviteeIds);
		const allConnected = inviteeIds.every(
			(id) => states.get(id) === 'connected',
		);

		if (!allConnected) {
			throw new BadRequestException({
				code: 'INVITEE_NOT_CONNECTED',
				message: 'You can only invite people you are connected with.',
			});
		}
	}

	/**
	 * Best effort, and only after the event is committed: an event that was
	 * created must not be reported as failed because a courtesy notification
	 * could not be raised. Bounded by MAX_INVITEES, which is what keeps this
	 * inline rather than on a queue.
	 */
	private async notifyInvitees(
		hostId: string,
		eventId: string,
		inviteeIds: string[],
	): Promise<void> {
		for (const userId of inviteeIds) {
			try {
				const notification = await this.notifications.create({
					userId,
					kind: NotificationKind.EventInvite,
					actorId: hostId,
					subjectId: eventId,
				});

				this.gateway.broadcastNotification(userId, notification);
			} catch (error) {
				this.logger.warn(
					`Could not notify ${userId} of event ${eventId}: ${String(error)}`,
				);
			}
		}
	}

	/** One query for every event on a page, oldest invitation first. */
	private async invitesFor(eventIds: string[]): Promise<Map<string, User[]>> {
		const byEvent = new Map<string, User[]>();

		if (eventIds.length === 0) return byEvent;

		const rows = await this.invites.find({
			where: { eventId: In(eventIds) },
			relations: { user: { photos: true } },
			select: { id: true, eventId: true, user: PERSON_SELECT },
			order: { createdAt: 'ASC' },
		});

		for (const row of rows) {
			const list = byEvent.get(row.eventId) ?? [];

			list.push(row.user);
			byEvent.set(row.eventId, list);
		}

		return byEvent;
	}

	private toPerson(user: User): EventPersonDto {
		const avatar = user.photos?.find(
			(photo) => photo.position === AVATAR_POSITION,
		);

		return new EventPersonDto(
			user,
			avatar
				? this.storage.buildUrl(avatar.storageId, 'thumbnail')
				: null,
		);
	}

	private coverUrl(event: Event): string | null {
		return event.coverStorageId
			? this.storage.buildUrl(event.coverStorageId, 'full')
			: null;
	}

	private notFound(): NotFoundException {
		return new NotFoundException({
			code: 'EVENT_NOT_FOUND',
			message: 'That event is no longer available.',
		});
	}
}
