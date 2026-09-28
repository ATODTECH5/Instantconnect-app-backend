import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import { BlocksService } from '../blocks/blocks.service';
import { PageInfoDto } from '../common/dto/pagination.dto';
import { ChatGateway } from '../chat/chat.gateway';
import { ConnectionsService } from '../connections/connections.service';
import { NotificationKind } from '../notifications/entities/notification-kind.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { Category } from '../reference/entities/category.entity';
import { Storage, type UploadSignature } from '../storage/storage';
import { AVATAR_POSITION } from '../users/entities/user-photo.entity';
import { User } from '../users/entities/user.entity';
import { UserStatus } from '../users/entities/user-status.enum';
import {
	CARD_FACES,
	type CreateEventDto,
	DETAIL_ATTENDEES,
	EventDetailDto,
	EventPageDto,
	type EventPeople,
	EventPersonDto,
	EventRole,
	EventSummaryDto,
	EventTimeframe,
	type ListMyEventsQueryDto,
	NearbyEventDto,
	NearbyEventPageDto,
	type NearbyEventsQueryDto,
	RecentVenueDto,
} from './dto/event.dto';
import { EventAttendee } from './entities/event-attendee.entity';
import { EventInvite } from './entities/event-invite.entity';
import { Event } from './entities/event.entity';

const RECENT_VENUES = 5;

const NO_PEOPLE: EventPeople = {
	inviteeCount: 0,
	inviteePreview: [],
	attendeeCount: 0,
	attendeePreview: [],
};

const METRES_PER_KM = 1000;

/**
 * An event under way stays upcoming until it ends, so it can still be reached
 * from a list while it is running. `endsAt` is always after `startsAt` when set.
 */
const ENDS_OR_STARTS = 'COALESCE(event.endsAt, event.startsAt)';

/** Null for an account with no location, which ST_DWithin then never matches. */
const VIEWER_ORIGIN =
	'(SELECT viewer."location" FROM "users" viewer WHERE viewer.id = :viewerId)';

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
		@InjectRepository(EventAttendee)
		private readonly attendees: Repository<EventAttendee>,
		@InjectRepository(Category)
		private readonly categories: Repository<Category>,
		private readonly dataSource: DataSource,
		private readonly storage: Storage,
		private readonly connections: ConnectionsService,
		private readonly blocks: BlocksService,
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
		viewerId: string,
		query: ListMyEventsQueryDto,
	): Promise<EventPageDto> {
		const base = this.events
			.createQueryBuilder('event')
			.innerJoin('event.host', 'host')
			.where(
				query.role === EventRole.Host
					? 'event.hostId = :viewerId'
					: `(event.hostId = :viewerId OR EXISTS (
							SELECT 1 FROM "event_invites" invite
							WHERE invite."eventId" = event.id AND invite."userId" = :viewerId
						) OR EXISTS (
							SELECT 1 FROM "event_attendees" attendee
							WHERE attendee."eventId" = event.id AND attendee."userId" = :viewerId
						))`,
			)
			.andWhere(BlocksService.hiddenFromViewerClause('host', 'viewerId'))
			.setParameters({ viewerId, now: new Date() });

		if (query.when === EventTimeframe.Upcoming) {
			base.andWhere(`${ENDS_OR_STARTS} >= :now`);
		} else if (query.when === EventTimeframe.Past) {
			base.andWhere(`${ENDS_OR_STARTS} < :now`);
		}

		const [rows, total] = await base
			.leftJoinAndSelect('event.category', 'category')
			.orderBy(
				'event.startsAt',
				query.when === EventTimeframe.Upcoming ? 'ASC' : 'DESC',
			)
			.addOrderBy('event.id', 'ASC')
			.limit(query.limit)
			.offset(query.offset)
			.getManyAndCount();

		const people = await this.peopleFor(rows, viewerId);

		return new EventPageDto(
			rows.map(
				(row) =>
					new EventSummaryDto(
						row,
						this.coverUrl(row),
						people.get(row.id) ?? NO_PEOPLE,
					),
			),
			new PageInfoDto(total, query),
		);
	}

	/**
	 * Public events that have not ended, within the radius of the viewer's
	 * saved location, soonest first. The viewer's own public events are
	 * included, so a host sees what everyone else nearby sees. An account with
	 * no location matches nothing rather than failing, since Home already
	 * asks for a location through the people rail.
	 */
	async listNearby(
		viewerId: string,
		query: NearbyEventsQueryDto,
	): Promise<NearbyEventPageDto> {
		const base = this.events
			.createQueryBuilder('event')
			.innerJoin('event.host', 'host')
			.where('event.isPublic = true')
			.andWhere(`${ENDS_OR_STARTS} >= :now`)
			.andWhere('host.status = :active')
			.andWhere(
				`ST_DWithin(event.venueLocation, ${VIEWER_ORIGIN}, :radius)`,
			)
			.andWhere(BlocksService.hiddenFromViewerClause('host', 'viewerId'))
			.setParameters({
				viewerId,
				now: new Date(),
				active: UserStatus.Active,
				radius: query.radiusKm * METRES_PER_KM,
			});

		const total = await base.getCount();

		if (total === 0) {
			return new NearbyEventPageDto([], new PageInfoDto(0, query));
		}

		const { entities, raw } = await base
			.clone()
			.leftJoinAndSelect('event.category', 'category')
			.addSelect(
				`ST_Distance(event.venueLocation, ${VIEWER_ORIGIN})`,
				'distance_m',
			)
			.orderBy('event.startsAt', 'ASC')
			.addOrderBy('event.id', 'ASC')
			.limit(query.limit)
			.offset(query.offset)
			.getRawAndEntities<{ distance_m: string }>();

		const people = await this.peopleFor(entities, viewerId);

		return new NearbyEventPageDto(
			entities.map(
				(event, index) =>
					new NearbyEventDto(
						event,
						this.coverUrl(event),
						people.get(event.id) ?? NO_PEOPLE,
						Number(raw[index].distance_m),
					),
			),
			new PageInfoDto(total, query),
		);
	}

	/**
	 * Free events only: there is no checkout, so a paid event would be joined
	 * without anyone paying. Joining twice is one join, and only the first
	 * tells the host.
	 */
	async join(viewerId: string, id: string): Promise<EventDetailDto> {
		const event = await this.visibleEvent(viewerId, id);

		if (event.hostId === viewerId) {
			throw new BadRequestException({
				code: 'EVENT_HOST_CANNOT_JOIN',
				message: 'You are hosting this event.',
			});
		}

		this.assertNotEnded(event);

		if (event.priceMinor > 0) {
			throw new BadRequestException({
				code: 'EVENT_TICKETS_UNAVAILABLE',
				message: 'Tickets for paid events are not available yet.',
			});
		}

		const result = await this.attendees
			.createQueryBuilder()
			.insert()
			.into(EventAttendee)
			.values({ eventId: id, userId: viewerId })
			.orIgnore()
			.execute();

		if ((result.raw as unknown[]).length > 0) {
			await this.notify(
				event.hostId,
				NotificationKind.EventJoined,
				viewerId,
				id,
			);
		}

		return this.findOne(viewerId, id);
	}

	/** Idempotent, like joining: leaving an event you are not going to is a no-op. */
	async leave(viewerId: string, id: string): Promise<EventDetailDto> {
		const event = await this.visibleEvent(viewerId, id);

		this.assertNotEnded(event);

		await this.attendees.delete({ eventId: id, userId: viewerId });

		return this.findOne(viewerId, id);
	}

	/**
	 * A private event reads as missing to anyone but its host, invitees and
	 * attendees, rather than as forbidden, so its existence is not disclosed
	 * either.
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
		const [invitesByEvent, attendance, own] = await Promise.all([
			this.invitesFor([event.id]),
			this.attendanceFor([event.id], DETAIL_ATTENDEES),
			this.attendees.findOne({
				where: { eventId: event.id, userId: viewerId },
				select: { id: true, createdAt: true },
			}),
		]);
		const invitees = invitesByEvent.get(event.id) ?? [];
		const going = attendance.get(event.id) ?? { count: 0, people: [] };
		const isInvited = invitees.some((user) => user.id === viewerId);

		if (!event.isPublic && !isHost && !isInvited && !own) {
			throw this.notFound();
		}

		const visibleInvitees = isHost
			? invitees.map((user) => this.toPerson(user))
			: [];
		const attendees = going.people.map((user) => this.toPerson(user));

		return new EventDetailDto(
			event,
			this.coverUrl(event),
			{
				inviteeCount: invitees.length,
				inviteePreview: visibleInvitees.slice(0, CARD_FACES),
				attendeeCount: going.count,
				attendeePreview: attendees.slice(0, CARD_FACES),
			},
			{
				host: this.toPerson(event.host),
				isHost,
				invitees: visibleInvitees,
				attendees,
				joinedAt: own?.createdAt ?? null,
			},
		);
	}

	/**
	 * The gate for joining and leaving: the same visibility as the detail
	 * screen, and nobody can act on an event whose host they have blocked or
	 * been blocked by.
	 */
	private async visibleEvent(viewerId: string, id: string): Promise<Event> {
		const event = await this.events.findOne({
			where: { id },
			select: {
				id: true,
				hostId: true,
				isPublic: true,
				startsAt: true,
				endsAt: true,
				priceMinor: true,
			},
		});

		if (!event) throw this.notFound();

		const [isInvited, isAttending, isBlocked] = await Promise.all([
			this.invites.exists({ where: { eventId: id, userId: viewerId } }),
			this.attendees.exists({ where: { eventId: id, userId: viewerId } }),
			this.blocks.isBlockedEitherWay(viewerId, event.hostId),
		]);
		const canSee =
			event.isPublic ||
			event.hostId === viewerId ||
			isInvited ||
			isAttending;

		if (!canSee || isBlocked) throw this.notFound();

		return event;
	}

	private assertNotEnded(event: Event): void {
		const endsAt = event.endsAt ?? event.startsAt;

		if (endsAt.getTime() < Date.now()) {
			throw new BadRequestException({
				code: 'EVENT_ENDED',
				message: 'This event has already ended.',
			});
		}
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
			await this.notify(
				userId,
				NotificationKind.EventInvite,
				hostId,
				eventId,
			);
		}
	}

	/** Never throws: the write it follows has already been committed. */
	private async notify(
		userId: string,
		kind: NotificationKind,
		actorId: string,
		eventId: string,
	): Promise<void> {
		try {
			const notification = await this.notifications.create({
				userId,
				kind,
				actorId,
				subjectId: eventId,
			});

			this.gateway.broadcastNotification(userId, notification);
		} catch (error) {
			this.logger.warn(
				`Could not notify ${userId} (${kind}) about event ${eventId}: ${String(error)}`,
			);
		}
	}

	/**
	 * Counts and card faces for a page of events. Invitee faces go to the
	 * host only, matching the detail screen; attendee faces go to anyone who
	 * can see the event.
	 */
	private async peopleFor(
		events: Event[],
		viewerId: string,
	): Promise<Map<string, EventPeople>> {
		const ids = events.map((event) => event.id);
		const hostedIds = events
			.filter((event) => event.hostId === viewerId)
			.map((event) => event.id);

		const [inviteCounts, hostedInvites, attendance] = await Promise.all([
			this.inviteCountsFor(ids),
			this.invitesFor(hostedIds),
			this.attendanceFor(ids, CARD_FACES),
		]);

		return new Map(
			ids.map((id) => {
				const going = attendance.get(id) ?? { count: 0, people: [] };

				return [
					id,
					{
						inviteeCount: inviteCounts.get(id) ?? 0,
						inviteePreview: (hostedInvites.get(id) ?? [])
							.slice(0, CARD_FACES)
							.map((user) => this.toPerson(user)),
						attendeeCount: going.count,
						attendeePreview: going.people.map((user) =>
							this.toPerson(user),
						),
					},
				];
			}),
		);
	}

	/**
	 * The total going to each event and its first `limit` attendees, oldest
	 * first. Ranked in SQL so a popular event never loads every attendee.
	 */
	private async attendanceFor(
		eventIds: string[],
		limit: number,
	): Promise<Map<string, { count: number; people: User[] }>> {
		const byEvent = new Map<string, { count: number; people: User[] }>();

		if (eventIds.length === 0) return byEvent;

		const [counts, ranked] = await Promise.all([
			this.attendees
				.createQueryBuilder('attendee')
				.select('attendee.eventId', 'eventId')
				.addSelect('COUNT(*)', 'count')
				.where('attendee.eventId IN (:...eventIds)', { eventIds })
				.groupBy('attendee.eventId')
				.getRawMany<{ eventId: string; count: string }>(),
			this.dataSource.query<{ eventId: string; userId: string }[]>(
				`SELECT "eventId", "userId" FROM (
					SELECT a."eventId", a."userId", a."createdAt",
						ROW_NUMBER() OVER (PARTITION BY a."eventId" ORDER BY a."createdAt", a.id) AS rank
					FROM "event_attendees" a
					WHERE a."eventId" = ANY($1)
				) ranked
				WHERE rank <= $2
				ORDER BY "eventId", "createdAt"`,
				[eventIds, limit],
			),
		]);

		const users = ranked.length
			? await this.dataSource.getRepository(User).find({
					where: {
						id: In([...new Set(ranked.map((row) => row.userId))]),
					},
					relations: { photos: true },
					select: PERSON_SELECT,
				})
			: [];
		const userById = new Map(users.map((user) => [user.id, user]));

		for (const row of counts) {
			byEvent.set(row.eventId, { count: Number(row.count), people: [] });
		}

		for (const row of ranked) {
			const user = userById.get(row.userId);

			if (user) byEvent.get(row.eventId)?.people.push(user);
		}

		return byEvent;
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

	private async inviteCountsFor(
		eventIds: string[],
	): Promise<Map<string, number>> {
		if (eventIds.length === 0) return new Map();

		const rows = await this.invites
			.createQueryBuilder('invite')
			.select('invite.eventId', 'eventId')
			.addSelect('COUNT(*)', 'count')
			.where('invite.eventId IN (:...eventIds)', { eventIds })
			.groupBy('invite.eventId')
			.getRawMany<{ eventId: string; count: string }>();

		return new Map(rows.map((row) => [row.eventId, Number(row.count)]));
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
