import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { PageInfoDto } from '../common/dto/pagination.dto';
import { csvLine, escapeLike } from '../common/utils/csv.util';
import { Storage } from '../storage/storage';
import {
	type AdminEventFiltersDto,
	type AdminEventStatusFilterDto,
	type EventStatus,
	type EventWindow,
	type ListAdminEventsQueryDto,
} from './dto/admin-event-filters.dto';
import {
	AdminEventAttendeeDto,
	AdminEventCountsDto,
	AdminEventDetailDto,
	AdminEventPageDto,
	AdminEventRowDto,
	AdminEventStatsDto,
} from './dto/admin-event.dto';

const EXPORT_BATCH_SIZE = 500;
export const MAX_EXPORT_ROWS = 10_000;
const RECENT_ATTENDEES = 20;

/** The app's rule: a running event is not past until it ends. */
const STATUS = `CASE
  WHEN e."startsAt" > now() THEN 'upcoming'
  WHEN COALESCE(e."endsAt", e."startsAt") > now() THEN 'ongoing'
  ELSE 'past' END`;

const WINDOW: Record<EventWindow, string> = {
	next30d: `e."startsAt" >= now() AND e."startsAt" < now() + interval '30 days'`,
	next90d: `e."startsAt" >= now() AND e."startsAt" < now() + interval '90 days'`,
	last30d: `e."startsAt" < now() AND e."startsAt" >= now() - interval '30 days'`,
	last90d: `e."startsAt" < now() AND e."startsAt" >= now() - interval '90 days'`,
	last180d: `e."startsAt" < now() AND e."startsAt" >= now() - interval '180 days'`,
};

const ROW_COLUMNS = `
  e."id", e."title", e."startsAt", e."endsAt", e."priceMinor", e."isPublic",
  e."createdAt", e."categoryId", c."label" AS "categoryLabel",
  u."id" AS "hostId", u."fullName" AS "hostName", u."email" AS "hostEmail",
  (u."deletedAt" IS NOT NULL) AS "hostDeleted",
  p."storageId" AS "hostAvatarStorageId",
  ${STATUS} AS "status",
  (SELECT count(*) FROM "event_attendees" a WHERE a."eventId" = e."id")::int AS "attendees"
`;

/** Soft-deleted hosts are kept: their events still exist and are still listed. */
const FROM_EVENTS = `
  FROM "events" e
  JOIN "users" u ON u."id" = e."hostId"
  LEFT JOIN "categories" c ON c."id" = e."categoryId"
  LEFT JOIN "user_photos" p ON p."userId" = u."id" AND p."position" = 0
`;

type RowRecord = {
	id: string;
	title: string;
	startsAt: Date;
	endsAt: Date | null;
	priceMinor: number;
	isPublic: boolean;
	createdAt: Date;
	categoryId: string | null;
	categoryLabel: string | null;
	hostId: string;
	hostName: string;
	hostEmail: string;
	hostDeleted: boolean;
	hostAvatarStorageId: string | null;
	status: EventStatus;
	attendees: number;
};

type DetailRecord = RowRecord & {
	description: string | null;
	venueName: string;
	venueAddress: string | null;
	coverStorageId: string | null;
	invited: number;
};

const iso = (date: Date) => new Date(date).toISOString();

const CSV_COLUMNS = [
	'Event ID',
	'Title',
	'Host',
	'Host email',
	'Category',
	'Status',
	'Starts',
	'Ends',
	'Type',
	'Price (NGN)',
	'Visibility',
	'Attendees',
	'Created',
] as const;

@Injectable()
export class AdminEventsService {
	constructor(
		private readonly dataSource: DataSource,
		private readonly storage: Storage,
	) {}

	async list(query: ListAdminEventsQueryDto): Promise<AdminEventPageDto> {
		const params: unknown[] = [];
		const where = this.whereFor(query, params);

		const countParams: unknown[] = [];
		const countWhere = this.whereFor(
			{ ...query, status: undefined },
			countParams,
		);

		const [rows, [{ total }], counted] = await Promise.all([
			this.dataSource.query<RowRecord[]>(
				`SELECT ${ROW_COLUMNS} ${FROM_EVENTS} WHERE ${where}
         ORDER BY e."createdAt" DESC, e."id" DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
				[...params, query.limit, query.offset],
			),
			this.dataSource.query<{ total: number }[]>(
				`SELECT count(*)::int AS "total" ${FROM_EVENTS} WHERE ${where}`,
				params,
			),
			this.dataSource.query<{ status: EventStatus; count: number }[]>(
				`SELECT ${STATUS} AS "status", count(*)::int AS "count"
         ${FROM_EVENTS} WHERE ${countWhere} GROUP BY 1`,
				countParams,
			),
		]);

		const counts: AdminEventCountsDto = {
			all: 0,
			upcoming: 0,
			ongoing: 0,
			past: 0,
		};
		for (const { status, count } of counted) {
			counts[status] = count;
			counts.all += count;
		}

		return new AdminEventPageDto(
			rows.map((row) => this.toRow(row)),
			new PageInfoDto(total, query),
			counts,
		);
	}

	async stats(): Promise<AdminEventStatsDto> {
		const [row] = await this.dataSource.query<
			Omit<AdminEventStatsDto, 'revenueMinor'>[]
		>(
			`SELECT
         count(*)::int AS "total",
         count(*) FILTER (WHERE COALESCE("endsAt", "startsAt") > now())::int AS "upcoming",
         count(*) FILTER (WHERE COALESCE("endsAt", "startsAt") <= now())::int AS "past"
       FROM "events"
       WHERE "hostId" IS NOT NULL`,
		);

		return { ...row, revenueMinor: 0 };
	}

	async findOne(id: string): Promise<AdminEventDetailDto> {
		const [[row], attendees] = await Promise.all([
			this.dataSource.query<DetailRecord[]>(
				`SELECT ${ROW_COLUMNS},
           e."description", e."venueName", e."venueAddress", e."coverStorageId",
           (SELECT count(*) FROM "event_invites" i WHERE i."eventId" = e."id")::int AS "invited"
         ${FROM_EVENTS} WHERE e."id" = $1`,
				[id],
			),
			this.dataSource.query<
				{
					id: string;
					fullName: string;
					avatarStorageId: string | null;
					occupation: string | null;
					joinedAt: Date;
				}[]
			>(
				`SELECT u."id", u."fullName", p."storageId" AS "avatarStorageId",
           o."label" AS "occupation", a."createdAt" AS "joinedAt"
         FROM "event_attendees" a
         JOIN "users" u ON u."id" = a."userId" AND u."deletedAt" IS NULL
         LEFT JOIN "user_photos" p ON p."userId" = u."id" AND p."position" = 0
         LEFT JOIN "occupations" o ON o."id" = u."occupationId"
         WHERE a."eventId" = $1
         ORDER BY a."createdAt" DESC
         LIMIT ${RECENT_ATTENDEES}`,
				[id],
			),
		]);

		if (!row) {
			throw new NotFoundException({
				code: 'EVENT_NOT_FOUND',
				message: 'That event does not exist.',
			});
		}

		return {
			...this.toRow(row),
			description: row.description,
			venueName: row.venueName,
			venueAddress: row.venueAddress,
			coverUrl: row.coverStorageId
				? this.storage.buildUrl(row.coverStorageId, 'full')
				: null,
			invited: row.invited,
			recentAttendees: attendees.map((person): AdminEventAttendeeDto => ({
				id: person.id,
				fullName: person.fullName,
				avatarUrl: this.avatarUrl(person.avatarStorageId),
				occupation: person.occupation,
				joinedAt: iso(person.joinedAt),
			})),
			revenueMinor: 0,
		};
	}

	/** Keyset batches, as the members export does, so memory stays flat. */
	async *exportCsv(
		filters: AdminEventStatusFilterDto,
	): AsyncGenerator<string> {
		yield csvLine([...CSV_COLUMNS]);

		let after: { createdAt: string; id: string } | null = null;
		let written = 0;

		while (written < MAX_EXPORT_ROWS) {
			const params: unknown[] = [];
			let where = this.whereFor(filters, params);

			if (after) {
				params.push(after.createdAt, after.id);
				where += ` AND (e."createdAt", e."id") < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
			}

			const batchSize = Math.min(
				EXPORT_BATCH_SIZE,
				MAX_EXPORT_ROWS - written,
			);
			const rows = await this.dataSource.query<
				(RowRecord & { cursor: string })[]
			>(
				`SELECT ${ROW_COLUMNS}, e."createdAt"::text AS "cursor" ${FROM_EVENTS}
         WHERE ${where}
         ORDER BY e."createdAt" DESC, e."id" DESC
         LIMIT $${params.length + 1}`,
				[...params, batchSize],
			);

			for (const row of rows) {
				yield csvLine([
					row.id,
					row.title,
					row.hostName,
					row.hostEmail,
					row.categoryLabel,
					row.status,
					iso(row.startsAt),
					row.endsAt ? iso(row.endsAt) : null,
					row.priceMinor > 0 ? 'paid' : 'free',
					row.priceMinor / 100,
					row.isPublic ? 'public' : 'invite only',
					row.attendees,
					iso(row.createdAt),
				]);
			}

			written += rows.length;
			if (rows.length < batchSize) return;

			const last = rows[rows.length - 1];
			after = { createdAt: last.cursor, id: last.id };
		}
	}

	private whereFor(
		filters: AdminEventFiltersDto & { status?: EventStatus },
		params: unknown[],
	): string {
		const bind = (value: unknown) => {
			params.push(value);
			return `$${params.length}`;
		};
		const clauses = ['TRUE'];

		if (filters.search) {
			const pattern = bind(`%${escapeLike(filters.search)}%`);
			clauses.push(
				`(e."title" ILIKE ${pattern} OR u."fullName" ILIKE ${pattern})`,
			);
		}
		if (filters.status) clauses.push(`${STATUS} = ${bind(filters.status)}`);
		if (filters.type === 'free') clauses.push(`e."priceMinor" = 0`);
		if (filters.type === 'paid') clauses.push(`e."priceMinor" > 0`);
		if (filters.categoryId)
			clauses.push(`e."categoryId" = ${bind(filters.categoryId)}`);
		if (filters.window) clauses.push(WINDOW[filters.window]);

		return clauses.join(' AND ');
	}

	private toRow(row: RowRecord): AdminEventRowDto {
		return {
			id: row.id,
			title: row.title,
			host: {
				id: row.hostId,
				fullName: row.hostName,
				email: row.hostEmail,
				avatarUrl: this.avatarUrl(row.hostAvatarStorageId),
				isDeleted: row.hostDeleted,
			},
			category:
				row.categoryId && row.categoryLabel
					? { id: row.categoryId, label: row.categoryLabel }
					: null,
			status: row.status,
			startsAt: iso(row.startsAt),
			endsAt: row.endsAt ? iso(row.endsAt) : null,
			priceMinor: row.priceMinor,
			isPublic: row.isPublic,
			attendees: row.attendees,
			createdAt: iso(row.createdAt),
		};
	}

	private avatarUrl(storageId: string | null): string | null {
		return storageId ? this.storage.buildUrl(storageId, 'thumbnail') : null;
	}
}
