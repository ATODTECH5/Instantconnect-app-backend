import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { PageInfoDto, PaginationQueryDto } from '../common/dto/pagination.dto';
import {
	DashboardActivityDto,
	DashboardActivityKind,
	DashboardActivityPageDto,
	DashboardActivityStatus,
} from './dto/dashboard-activity.dto';
import {
	CountStatDto,
	DashboardStatsDto,
	PendingStatDto,
	RevenueStatDto,
} from './dto/dashboard-stats.dto';
import {
	EventCategoryShareDto,
	EventsByCategoryDto,
} from './dto/events-by-category.dto';
import { UserGrowthDto, UserGrowthQueryDto } from './dto/user-growth.dto';

/** Every user is in Lagos, so a "month" starts at Lagos midnight, not UTC. */
const REPORTING_TIME_ZONE = 'Africa/Lagos';

const MEMBER_FILTER = `"role" = 'user' AND "deletedAt" IS NULL`;

/** An event without an end time is over once it has started. */
/** Member events only; imported listings are not activity on the platform. */
const EVENT_STILL_ON = (at: string) =>
	`"hostId" IS NOT NULL AND COALESCE("endsAt", "startsAt") > ${at}`;

type StatsRow = {
	totalUsers: number;
	totalUsersBefore: number;
	activeEvents: number;
	activeEventsBefore: number;
	pendingKyc: number;
};

type ActivityRow = {
	id: string;
	kind: DashboardActivityKind;
	occurredAt: Date;
	eventTitle: string | null;
	kycStatus: string | null;
	userId: string;
	fullName: string;
	email: string;
};

const percentChange = (now: number, before: number): number | null =>
	before === 0 ? null : Math.round(((now - before) / before) * 1000) / 10;

@Injectable()
export class AdminDashboardService {
	constructor(private readonly dataSource: DataSource) {}

	async getStats(): Promise<DashboardStatsDto> {
		const [row] = await this.dataSource.query<StatsRow[]>(`
      SELECT
        (SELECT count(*) FROM "users" WHERE ${MEMBER_FILTER})::int AS "totalUsers",
        (SELECT count(*) FROM "users"
          WHERE ${MEMBER_FILTER} AND "createdAt" <= now() - interval '30 days')::int AS "totalUsersBefore",
        (SELECT count(*) FROM "events" WHERE ${EVENT_STILL_ON('now()')})::int AS "activeEvents",
        (SELECT count(*) FROM "events"
          WHERE "createdAt" <= now() - interval '30 days'
            AND ${EVENT_STILL_ON(`now() - interval '30 days'`)})::int AS "activeEventsBefore",
        (SELECT count(*) FROM "kyc_submissions" WHERE "status" = 'pending')::int AS "pendingKyc"
    `);

		const stats = new DashboardStatsDto();
		stats.totalUsers = new CountStatDto(
			row.totalUsers,
			percentChange(row.totalUsers, row.totalUsersBefore),
		);
		stats.activeEvents = new CountStatDto(
			row.activeEvents,
			percentChange(row.activeEvents, row.activeEventsBefore),
		);
		// No money moves yet: paid events show a price but cannot be joined.
		stats.revenue = new RevenueStatDto(0, null);
		stats.pendingKyc = new PendingStatDto(row.pendingKyc);

		return stats;
	}

	async getUserGrowth(query: UserGrowthQueryDto): Promise<UserGrowthDto> {
		const points = await this.dataSource.query<
			{ month: string; newUsers: number }[]
		>(
			`
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', now() AT TIME ZONE $2) - make_interval(months => $1 - 1),
          date_trunc('month', now() AT TIME ZONE $2),
          interval '1 month'
        ) AS "start"
      )
      SELECT
        to_char(m."start", 'YYYY-MM') AS "month",
        count(u."id")::int AS "newUsers"
      FROM months m
      LEFT JOIN "users" u
        ON u."role" = 'user'
       AND u."deletedAt" IS NULL
       AND u."createdAt" >= (m."start" AT TIME ZONE $2)
       AND u."createdAt" < ((m."start" + interval '1 month') AT TIME ZONE $2)
      GROUP BY m."start"
      ORDER BY m."start"
      `,
			[query.months, REPORTING_TIME_ZONE],
		);

		return new UserGrowthDto(points);
	}

	async getEventsByCategory(): Promise<EventsByCategoryDto> {
		const rows = await this.dataSource.query<
			{ categoryId: string | null; label: string | null; count: number }[]
		>(`
      SELECT c."id" AS "categoryId", c."label" AS "label", count(*)::int AS "count"
      FROM "events" e
      LEFT JOIN "categories" c ON c."id" = e."categoryId"
      WHERE ${EVENT_STILL_ON('now()')}
      GROUP BY c."id", c."label"
      ORDER BY "count" DESC, c."label"
    `);

		const total = rows.reduce((sum, row) => sum + row.count, 0);
		const categories = rows.map((row): EventCategoryShareDto => ({
			categoryId: row.categoryId,
			label: row.label ?? 'Uncategorised',
			count: row.count,
			percentage:
				total === 0 ? 0 : Math.round((row.count / total) * 1000) / 10,
		}));

		return new EventsByCategoryDto(total, categories);
	}

	/**
	 * Each source is cut to the page's end before the union, so the sort only
	 * ever sees offset + limit rows per source however large the tables grow.
	 */
	async getActivity(
		query: PaginationQueryDto,
	): Promise<DashboardActivityPageDto> {
		const window = query.offset + query.limit;

		const [rows, [{ total }]] = await Promise.all([
			this.dataSource.query<ActivityRow[]>(
				`
        SELECT a."id", a."kind", a."occurredAt", a."eventTitle", a."kycStatus",
               u."id" AS "userId", u."fullName", u."email"
        FROM (
          (SELECT "id", 'user_registered' AS "kind", "id" AS "userId", "createdAt" AS "occurredAt",
                  NULL::varchar AS "eventTitle", NULL::text AS "kycStatus"
             FROM "users" WHERE ${MEMBER_FILTER}
             ORDER BY "createdAt" DESC LIMIT $1)
          UNION ALL
          (SELECT "id", 'event_created', "hostId", "createdAt", "title", NULL
             FROM "events" WHERE "hostId" IS NOT NULL
             ORDER BY "createdAt" DESC LIMIT $1)
          UNION ALL
          (SELECT "id", 'kyc_submitted', "userId", "createdAt", NULL, "status"::text
             FROM "kyc_submissions" ORDER BY "createdAt" DESC LIMIT $1)
        ) a
        JOIN "users" u ON u."id" = a."userId"
        ORDER BY a."occurredAt" DESC, a."id" DESC
        LIMIT $2 OFFSET $3
        `,
				[window, query.limit, query.offset],
			),
			this.dataSource.query<{ total: number }[]>(`
        SELECT (
          (SELECT count(*) FROM "users" WHERE ${MEMBER_FILTER})
          + (SELECT count(*) FROM "events" e JOIN "users" u ON u."id" = e."hostId")
          + (SELECT count(*) FROM "kyc_submissions")
        )::int AS "total"
      `),
		]);

		return new DashboardActivityPageDto(
			rows.map(toActivity),
			new PageInfoDto(total, query),
		);
	}
}

function toActivity(row: ActivityRow): DashboardActivityDto {
	return {
		id: row.id,
		kind: row.kind,
		...describe(row),
		user: { id: row.userId, fullName: row.fullName, email: row.email },
		occurredAt: new Date(row.occurredAt).toISOString(),
	};
}

function describe(
	row: ActivityRow,
): Pick<DashboardActivityDto, 'description' | 'status'> {
	switch (row.kind) {
		case DashboardActivityKind.UserRegistered:
			return {
				description: 'Registered on the platform',
				status: DashboardActivityStatus.Successful,
			};
		case DashboardActivityKind.EventCreated:
			return {
				description: `Created new event '${row.eventTitle}'`,
				status: DashboardActivityStatus.Completed,
			};
		case DashboardActivityKind.KycSubmitted:
			return {
				description: 'Submitted KYC verification documents',
				status: row.kycStatus as DashboardActivityStatus,
			};
	}
}
