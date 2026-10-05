import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { externalEventsConfig } from '../config/configuration';
import type { ImportedEvent } from './imported-event';

const API_URL = 'https://www.eventbriteapi.com/v3';
const TIMEOUT_MS = 15_000;
/** Fifty events a page. No organizer worth importing lists more than this ahead. */
const MAX_PAGES = 5;
/** Imported prices are stored as kobo, so only naira can be stored faithfully. */
const NAIRA = 'NGN';

type EventbriteMoney = { currency: string; value: number };

type EventbriteEvent = {
	id: string;
	/** Shared by every date of a recurring event; null for a one off. */
	series_id: string | null;
	url: string;
	name: { text: string | null } | null;
	summary: string | null;
	start: { utc: string };
	end: { utc: string } | null;
	online_event: boolean;
	is_free: boolean;
	logo: { url: string | null; original?: { url: string | null } } | null;
	venue: {
		name: string | null;
		latitude: string | null;
		longitude: string | null;
		address: { localized_address_display: string | null } | null;
	} | null;
	organizer: { name: string | null } | null;
	ticket_availability: {
		minimum_ticket_price: EventbriteMoney | null;
	} | null;
};

export class EventbriteError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}

type EventbritePage = {
	events: EventbriteEvent[];
	pagination: { has_more_items: boolean };
};

/**
 * Reads the public, on sale events of one Eventbrite organizer. Eventbrite
 * switched its location search off in 2020, so a curated organizer list is
 * the only free way in. Events that cannot be placed on the map (online, or
 * no venue coordinates) or whose price cannot be shown honestly are dropped.
 * A recurring event keeps only its next date: a weekly meetup listed for six
 * months would otherwise fill the nearby list with copies of itself.
 */
@Injectable()
export class EventbriteClient {
	private readonly logger = new Logger(EventbriteClient.name);

	constructor(
		@Inject(externalEventsConfig.KEY)
		private readonly config: ConfigType<typeof externalEventsConfig>,
	) {}

	get isConfigured(): boolean {
		return Boolean(this.config.eventbriteToken);
	}

	/** Null when Eventbrite has no organizer with that id. */
	async findOrganizerName(organizerId: string): Promise<string | null> {
		try {
			const organizer = await this.request<{ name: string | null }>(
				`/organizers/${encodeURIComponent(organizerId)}/`,
			);

			return organizer.name?.trim() || `Organizer ${organizerId}`;
		} catch (error) {
			if (error instanceof EventbriteError && error.status === 404) {
				return null;
			}

			throw error;
		}
	}

	async listOrganizerEvents(organizerId: string): Promise<ImportedEvent[]> {
		const imported: ImportedEvent[] = [];
		const seriesSeen = new Set<string>();

		for (let page = 1; page <= MAX_PAGES; page++) {
			const body = await this.request<EventbritePage>(
				`/organizers/${encodeURIComponent(organizerId)}/events/`,
				{
					status: 'live',
					only_public: 'true',
					order_by: 'start_asc',
					expand: 'venue,organizer,ticket_availability',
					page: String(page),
				},
			);

			for (const event of body.events) {
				if (event.series_id && seriesSeen.has(event.series_id))
					continue;

				const mapped = this.toImportedEvent(event);

				// Pages are soonest first, so the first usable date is the next one.
				if (mapped && event.series_id) seriesSeen.add(event.series_id);

				if (mapped) imported.push(mapped);
			}

			if (!body.pagination.has_more_items) break;
		}

		return imported;
	}

	private async request<T>(
		path: string,
		query: Record<string, string> = {},
	): Promise<T> {
		const response = await fetch(
			`${API_URL}${path}?${new URLSearchParams(query)}`,
			{
				headers: {
					Accept: 'application/json',
					Authorization: `Bearer ${this.config.eventbriteToken}`,
				},
				signal: AbortSignal.timeout(TIMEOUT_MS),
			},
		);

		if (!response.ok) {
			throw new EventbriteError(
				response.status,
				`Eventbrite answered ${response.status}: ${(await response.text()).slice(0, 200)}`,
			);
		}

		return (await response.json()) as T;
	}

	private toImportedEvent(event: EventbriteEvent): ImportedEvent | null {
		const latitude = Number(event.venue?.latitude);
		const longitude = Number(event.venue?.longitude);
		const title = event.name?.text?.trim();

		if (event.online_event || !title) return null;
		if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
			return null;

		const priceMinor = this.priceMinor(event);

		if (priceMinor === null) {
			this.logger.debug(
				`Skipping Eventbrite event ${event.id}: no naira price`,
			);
			return null;
		}

		const startsAt = new Date(event.start.utc);
		const endsAt = event.end ? new Date(event.end.utc) : null;

		return {
			externalId: event.id,
			url: event.url,
			title,
			description: event.summary?.trim() || null,
			startsAt,
			endsAt: endsAt && endsAt > startsAt ? endsAt : null,
			venueName: event.venue?.name?.trim() || title,
			venueAddress:
				event.venue?.address?.localized_address_display?.trim() || null,
			latitude,
			longitude,
			priceMinor,
			coverUrl: event.logo?.original?.url ?? event.logo?.url ?? null,
			organizerName: event.organizer?.name?.trim() || null,
		};
	}

	/** Null when the event is paid but its cheapest ticket is not in naira. */
	private priceMinor(event: EventbriteEvent): number | null {
		if (event.is_free) return 0;

		const cheapest = event.ticket_availability?.minimum_ticket_price;

		return cheapest?.currency === NAIRA ? cheapest.value : null;
	}
}
