import {
	Injectable,
	Logger,
	type OnApplicationBootstrap,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Not, Repository } from 'typeorm';

import { Event, ExternalEventSource } from '../events/entities/event.entity';
import { EventbriteOrganizer } from './entities/eventbrite-organizer.entity';
import { EventbriteClient } from './eventbrite.client';
import type { ImportedEvent } from './imported-event';

/** Column widths on `events`; longer text from a listing is cut to fit. */
const TITLE_MAX = 80;
const DESCRIPTION_MAX = 1000;
const VENUE_NAME_MAX = 120;
const VENUE_ADDRESS_MAX = 255;
const ORGANIZER_MAX = 120;
const URL_MAX = 500;
const ERROR_MAX = 500;

const OVERWRITTEN_ON_SYNC = [
	'title',
	'description',
	'startsAt',
	'endsAt',
	'venueName',
	'venueAddress',
	'venueLocation',
	'priceMinor',
	'externalUrl',
	'externalCoverUrl',
	'organizerName',
	'externalOrganizerId',
	'updatedAt',
];

function clip(text: string | null, max: number): string | null {
	if (!text) return null;

	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Keeps imported events in step with their listings, one organizer at a
 * time. An event its organizer no longer lists has been cancelled or
 * unpublished, so it is deleted with its attendance, but only when that
 * organizer answered: a failed fetch must not read as "everything was
 * cancelled". Events already under way are left alone, since Eventbrite
 * stops listing them as live once they start.
 */
@Injectable()
export class ExternalEventsService implements OnApplicationBootstrap {
	private readonly logger = new Logger(ExternalEventsService.name);
	private syncing = false;

	constructor(
		@InjectRepository(Event)
		private readonly events: Repository<Event>,
		@InjectRepository(EventbriteOrganizer)
		private readonly organizers: Repository<EventbriteOrganizer>,
		private readonly eventbrite: EventbriteClient,
	) {}

	get isSyncing(): boolean {
		return this.syncing;
	}

	/** Not awaited, so a slow listing never holds up the boot. */
	onApplicationBootstrap(): void {
		void this.syncEventbrite();
	}

	@Cron(CronExpression.EVERY_6_HOURS)
	async syncEventbrite(): Promise<void> {
		if (!this.eventbrite.isConfigured || this.syncing) return;

		this.syncing = true;

		try {
			const organizers = await this.organizers.find({
				where: { isActive: true },
				order: { createdAt: 'ASC' },
			});
			let imported = 0;
			let failures = 0;

			for (const organizer of organizers) {
				const count = await this.syncOrganizer(organizer);

				if (count === null) failures++;
				else imported += count;
			}

			this.logger.log(
				`Eventbrite import: ${imported} events from ${organizers.length - failures}/${organizers.length} organizers`,
			);
		} catch (error) {
			this.logger.error(`Eventbrite import failed: ${String(error)}`);
		} finally {
			this.syncing = false;
		}
	}

	/**
	 * Returns how many events were imported, or null when the organizer could
	 * not be read; the outcome is also recorded on the organizer for the
	 * dashboard. Never throws.
	 */
	async syncOrganizer(
		organizer: EventbriteOrganizer,
	): Promise<number | null> {
		try {
			const imported = await this.eventbrite.listOrganizerEvents(
				organizer.organizerId,
			);

			await this.upsert(organizer.organizerId, imported);
			await this.removeUnlisted(
				organizer.organizerId,
				imported.map((event) => event.externalId),
			);
			const name =
				organizer.name ??
				imported[0]?.organizerName ??
				(await this.eventbrite.findOrganizerName(
					organizer.organizerId,
				));

			await this.organizers.update(organizer.id, {
				lastSyncedAt: new Date(),
				lastSyncError: null,
				name: clip(name, 160),
			});

			return imported.length;
		} catch (error) {
			this.logger.warn(
				`Eventbrite import failed for organizer ${organizer.organizerId}: ${String(error)}`,
			);
			await this.organizers
				.update(organizer.id, {
					lastSyncedAt: new Date(),
					lastSyncError: clip(
						error instanceof Error ? error.message : String(error),
						ERROR_MAX,
					),
				})
				.catch(() => undefined);

			return null;
		}
	}

	private async upsert(
		organizerId: string,
		imported: ImportedEvent[],
	): Promise<void> {
		const rows = imported
			.filter((event) => event.url.length <= URL_MAX)
			.map((event) => ({
				externalSource: ExternalEventSource.Eventbrite,
				externalId: event.externalId,
				externalOrganizerId: organizerId,
				externalUrl: event.url,
				externalCoverUrl:
					event.coverUrl && event.coverUrl.length <= URL_MAX
						? event.coverUrl
						: null,
				organizerName: clip(event.organizerName, ORGANIZER_MAX),
				title: clip(event.title, TITLE_MAX) ?? event.externalId,
				description: clip(event.description, DESCRIPTION_MAX),
				startsAt: event.startsAt,
				endsAt: event.endsAt,
				venueName: clip(event.venueName, VENUE_NAME_MAX) ?? '',
				venueAddress: clip(event.venueAddress, VENUE_ADDRESS_MAX),
				venueLocation: {
					type: 'Point' as const,
					coordinates: [event.longitude, event.latitude] as [
						number,
						number,
					],
				},
				priceMinor: event.priceMinor,
				isPublic: true,
				updatedAt: new Date(),
			}));

		if (rows.length === 0) return;

		await this.events
			.createQueryBuilder()
			.insert()
			.into(Event)
			.values(rows)
			.orUpdate(OVERWRITTEN_ON_SYNC, ['externalSource', 'externalId'], {
				indexPredicate: '"externalSource" IS NOT NULL',
			})
			.execute();
	}

	private async removeUnlisted(
		organizerId: string,
		listedIds: string[],
	): Promise<void> {
		await this.events.delete({
			externalSource: ExternalEventSource.Eventbrite,
			externalOrganizerId: organizerId,
			startsAt: MoreThan(new Date()),
			...(listedIds.length > 0 ? { externalId: Not(In(listedIds)) } : {}),
		});
	}
}
