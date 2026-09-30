import {
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ChatGateway } from '../chat/chat.gateway';
import { PageInfoDto } from '../common/dto/pagination.dto';
import { ArrivalState } from '../meetups/entities/arrival-state.enum';
import { MeetupStatus } from '../meetups/entities/meetup-status.enum';
import { MeetupsService } from '../meetups/meetups.service';
import { NotificationKind } from '../notifications/entities/notification-kind.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { Storage } from '../storage/storage';
import type {
	ListAdminMeetupsQueryDto,
	MeetupView,
} from './dto/admin-meetup-query.dto';
import {
	AdminMeetupDetailDto,
	AdminMeetupPageDto,
	AdminMeetupPartyDto,
	AdminMeetupRowDto,
	AdminMeetupStatsDto,
	LatLngDto,
} from './dto/admin-meetup.dto';

/** Stops a double click sending two checks. */
const SAFETY_CHECK_COOLDOWN_MS = 60_000;

const LAGOS_MIDNIGHT = `(date_trunc('day', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos')`;

const ONGOING = `(m."status" = 'active' OR (m."status" = 'scheduled' AND EXISTS (
  SELECT 1 FROM "meetup_participants" x
  WHERE x."meetupId" = m."id" AND x."arrivalState" <> 'pending')))`;

const VIEW: Record<MeetupView, { where: string; order: string }> = {
	ongoing: {
		where: ONGOING,
		order: `COALESCE(m."startedAt", m."scheduledAt") DESC, m."id" DESC`,
	},
	past: {
		where: `m."status" = 'ended'`,
		order: `m."endedAt" DESC, m."id" DESC`,
	},
};

const PARTIES = `(
  SELECT json_agg(json_build_object(
    'userId', p."userId",
    'fullName', u."fullName",
    'avatarStorageId', ph."storageId",
    'isProposer', p."userId" = m."proposerId",
    'arrivalState', p."arrivalState",
    'enRouteAt', p."enRouteAt",
    'arrivedAt', p."arrivedAt",
    'verifiedAt', p."verifiedAt",
    'isSharingLocation', p."isSharingLocation",
    'lat', ST_Y(p."lastLocation"::geometry),
    'lng', ST_X(p."lastLocation"::geometry),
    'locationAt', p."lastLocationAt"
  ) ORDER BY (p."userId" = m."proposerId") DESC)
  FROM "meetup_participants" p
  JOIN "users" u ON u."id" = p."userId"
  LEFT JOIN "user_photos" ph ON ph."userId" = u."id" AND ph."position" = 0
  WHERE p."meetupId" = m."id"
)`;

const ROW_COLUMNS = `
  m."id", m."status", m."scheduledAt", m."startedAt", m."endedAt",
  m."venueName", m."venueAddress",
  ST_Y(m."venueLocation"::geometry) AS "venueLat",
  ST_X(m."venueLocation"::geometry) AS "venueLng",
  m."flaggedAt", m."flagReason", f."fullName" AS "flaggedByName",
  ${PARTIES} AS "parties"
`;

const FROM_MEETUPS = `
  FROM "meetups" m
  LEFT JOIN "users" f ON f."id" = m."flaggedById"
`;

type PartyRecord = {
	userId: string;
	fullName: string;
	avatarStorageId: string | null;
	isProposer: boolean;
	arrivalState: ArrivalState;
	enRouteAt: string | null;
	arrivedAt: string | null;
	verifiedAt: string | null;
	isSharingLocation: boolean;
	lat: number | null;
	lng: number | null;
	locationAt: string | null;
};

type RowRecord = {
	id: string;
	status: MeetupStatus;
	scheduledAt: Date | null;
	startedAt: Date | null;
	endedAt: Date | null;
	venueName: string | null;
	venueAddress: string | null;
	venueLat: number | null;
	venueLng: number | null;
	flaggedAt: Date | null;
	flagReason: string | null;
	flaggedByName: string | null;
	parties: PartyRecord[] | null;
};

type DetailRecord = RowRecord & {
	createdAt: Date;
	respondedAt: Date | null;
	conversationId: string;
	distanceApartMeters: number | null;
};

const isoOrNull = (value: Date | string | null) =>
	value === null ? null : new Date(value).toISOString();

const point = (lat: number | null, lng: number | null): LatLngDto | null =>
	lat === null || lng === null ? null : { lat, lng };

@Injectable()
export class AdminMeetupsService {
	constructor(
		private readonly dataSource: DataSource,
		private readonly storage: Storage,
		private readonly meetups: MeetupsService,
		private readonly notifications: NotificationsService,
		private readonly gateway: ChatGateway,
	) {}

	async list(query: ListAdminMeetupsQueryDto): Promise<AdminMeetupPageDto> {
		const view = VIEW[query.view];

		const [rows, [{ total }]] = await Promise.all([
			this.dataSource.query<RowRecord[]>(
				`SELECT ${ROW_COLUMNS} ${FROM_MEETUPS} WHERE ${view.where}
         ORDER BY ${view.order} LIMIT $1 OFFSET $2`,
				[query.limit, query.offset],
			),
			this.dataSource.query<{ total: number }[]>(
				`SELECT count(*)::int AS "total" FROM "meetups" m WHERE ${view.where}`,
			),
		]);

		return new AdminMeetupPageDto(
			rows.map((row) => this.toRow(row)),
			new PageInfoDto(total, query),
		);
	}

	async stats(): Promise<AdminMeetupStatsDto> {
		const [row] = await this.dataSource.query<AdminMeetupStatsDto[]>(
			`SELECT
         count(*) FILTER (WHERE ${ONGOING})::int AS "activeNow",
         count(*) FILTER (WHERE m."startedAt" >= ${LAGOS_MIDNIGHT})::int AS "startedToday",
         count(*) FILTER (WHERE m."startedAt" >= ${LAGOS_MIDNIGHT} - interval '1 day'
           AND m."startedAt" < ${LAGOS_MIDNIGHT})::int AS "startedYesterday",
         count(*) FILTER (WHERE m."flaggedAt" IS NOT NULL)::int AS "flagged"
       FROM "meetups" m`,
		);

		return row;
	}

	async findOne(id: string): Promise<AdminMeetupDetailDto> {
		const [row] = await this.dataSource.query<DetailRecord[]>(
			`SELECT ${ROW_COLUMNS},
         m."createdAt", m."respondedAt", m."conversationId",
         (SELECT ST_Distance(a."lastLocation", b."lastLocation")
            FROM "meetup_participants" a
            JOIN "meetup_participants" b ON b."meetupId" = a."meetupId" AND b."id" > a."id"
            WHERE a."meetupId" = m."id"
              AND a."lastLocation" IS NOT NULL AND b."lastLocation" IS NOT NULL
         ) AS "distanceApartMeters"
       ${FROM_MEETUPS} WHERE m."id" = $1 AND m."status" <> 'proposed'`,
			[id],
		);

		if (!row) throw this.notFound();

		return {
			...this.toRow(row),
			proposedAt: new Date(row.createdAt).toISOString(),
			acceptedAt: isoOrNull(row.respondedAt),
			distanceApartMeters:
				row.distanceApartMeters === null
					? null
					: Math.round(row.distanceApartMeters),
			safetyChecksSentAt: (await this.safetyChecksSent(id)).map((at) =>
				at.toISOString(),
			),
		};
	}

	async flag(
		adminId: string,
		id: string,
		reason: string,
	): Promise<AdminMeetupDetailDto> {
		const result = await this.dataSource.query<unknown[]>(
			`UPDATE "meetups"
       SET "flaggedAt" = COALESCE("flaggedAt", now()), "flaggedById" = $2,
           "flagReason" = $3, "updatedAt" = now()
       WHERE "id" = $1 AND "status" <> 'proposed'
       RETURNING "id"`,
			[id, adminId, reason],
		);

		if (!(result as [unknown[], number])[1]) throw this.notFound();

		return this.findOne(id);
	}

	async unflag(id: string): Promise<AdminMeetupDetailDto> {
		const result = await this.dataSource.query<unknown[]>(
			`UPDATE "meetups"
       SET "flaggedAt" = NULL, "flaggedById" = NULL, "flagReason" = NULL,
           "updatedAt" = now()
       WHERE "id" = $1 AND "status" <> 'proposed'
       RETURNING "id"`,
			[id],
		);

		if (!(result as [unknown[], number])[1]) throw this.notFound();

		return this.findOne(id);
	}

	/**
	 * An in-app notification to both people, and live on the socket. It opens
	 * their chat thread, where the meetup card is.
	 */
	async sendSafetyCheck(id: string): Promise<AdminMeetupDetailDto> {
		const [meetup] = await this.dataSource.query<
			{
				status: MeetupStatus;
				conversationId: string;
				userIds: string[];
			}[]
		>(
			`SELECT m."status", m."conversationId",
         ARRAY(SELECT p."userId" FROM "meetup_participants" p WHERE p."meetupId" = m."id") AS "userIds"
       FROM "meetups" m WHERE m."id" = $1 AND m."status" <> 'proposed'`,
			[id],
		);

		if (!meetup) throw this.notFound();

		if (
			meetup.status !== MeetupStatus.Scheduled &&
			meetup.status !== MeetupStatus.Active
		) {
			throw new ConflictException({
				code: 'MEETUP_STATE_CONFLICT',
				message: `You can't send a safety check for a meetup that is ${meetup.status}.`,
			});
		}

		const [latest] = await this.safetyChecksSent(id);

		if (
			latest &&
			Date.now() - latest.getTime() < SAFETY_CHECK_COOLDOWN_MS
		) {
			throw new ConflictException({
				code: 'SAFETY_CHECK_TOO_SOON',
				message:
					'A safety check was just sent. Wait a minute before sending another.',
			});
		}

		for (const userId of meetup.userIds) {
			const notification = await this.notifications.create({
				userId,
				kind: NotificationKind.MeetupSafetyCheck,
				subjectId: meetup.conversationId,
			});

			this.gateway.broadcastNotification(userId, notification);
		}

		return this.findOne(id);
	}

	async stopTracking(id: string): Promise<AdminMeetupDetailDto> {
		await this.meetups.stopAllLocationSharing(id);

		return this.findOne(id);
	}

	/**
	 * Read from the notifications themselves, one per send: the proposer's
	 * copy. They share the conversation id with every other meetup in the
	 * thread, so they are bounded by this meetup's own lifetime.
	 */
	private async safetyChecksSent(id: string): Promise<Date[]> {
		const rows = await this.dataSource.query<{ createdAt: Date }[]>(
			`SELECT n."createdAt"
       FROM "meetups" m
       JOIN "notifications" n
         ON n."subjectId" = m."conversationId"
        AND n."userId" = m."proposerId"
        AND n."kind" = 'meetup_safety_check'
        AND n."createdAt" >= m."createdAt"
        AND n."createdAt" <= COALESCE(m."endedAt", m."cancelledAt", now())
       WHERE m."id" = $1
       ORDER BY n."createdAt" DESC`,
			[id],
		);

		return rows.map((row) => new Date(row.createdAt));
	}

	private toRow(row: RowRecord): AdminMeetupRowDto {
		return {
			id: row.id,
			status: row.status,
			scheduledAt: isoOrNull(row.scheduledAt),
			startedAt: isoOrNull(row.startedAt),
			endedAt: isoOrNull(row.endedAt),
			venueName: row.venueName,
			venueAddress: row.venueAddress,
			venue: point(row.venueLat, row.venueLng),
			parties: (row.parties ?? []).map((party): AdminMeetupPartyDto => ({
				userId: party.userId,
				fullName: party.fullName,
				avatarUrl: party.avatarStorageId
					? this.storage.buildUrl(party.avatarStorageId, 'thumbnail')
					: null,
				isProposer: party.isProposer,
				arrivalState: party.arrivalState,
				enRouteAt: isoOrNull(party.enRouteAt),
				arrivedAt: isoOrNull(party.arrivedAt),
				verifiedAt: isoOrNull(party.verifiedAt),
				isSharingLocation: party.isSharingLocation,
				location: point(party.lat, party.lng),
				locationAt: isoOrNull(party.locationAt),
			})),
			flag: row.flaggedAt
				? {
						flaggedAt: new Date(row.flaggedAt).toISOString(),
						flaggedByName: row.flaggedByName,
						reason: row.flagReason ?? '',
					}
				: null,
		};
	}

	private notFound(): NotFoundException {
		return new NotFoundException({
			code: 'MEETUP_NOT_FOUND',
			message: 'That meetup does not exist.',
		});
	}
}
