import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import {
	PageInfoDto,
	type PaginationQueryDto,
} from '../common/dto/pagination.dto';
import { csvLine, escapeLike } from '../common/utils/csv.util';
import type {
	CommunityPostDto,
	CommunityPostPageDto,
} from '../communities/dto/community-post.dto';
import { CommunityPostsService } from '../communities/community-posts.service';
import {
	CommunityReportReason,
	CommunityReportStatus,
} from '../communities/entities/community-report.entity';
import { Storage } from '../storage/storage';
import {
	type AdminCommunityDetailDto,
	type AdminCommunityFiltersDto,
	type AdminCommunityPageDto,
	type AdminCommunityRowDto,
	AdminCommunitySize,
	type AdminCommunityStatsDto,
	AdminCommunityStatus,
	type CommunityActivityDto,
	type ListAdminCommunitiesQueryDto,
	type ListCommunityReportsQueryDto,
	type ReportedPostPageDto,
} from './dto/admin-community.dto';

export const MAX_EXPORT_ROWS = 5000;

/** Active member accounts: who the Safety Community counts. */
const SAFETY_MEMBER_COUNT = `(SELECT count(*) FROM "users" u
	WHERE u."role" = 'user' AND u."status" = 'active' AND u."deletedAt" IS NULL)`;

const MEMBER_COUNT = `CASE WHEN c."isOfficial" THEN ${SAFETY_MEMBER_COUNT}
	ELSE (SELECT count(*) FROM "community_members" m WHERE m."communityId" = c."id") END`;

const OPEN_REPORTED_POSTS = `(SELECT count(DISTINCT r."postId") FROM "community_reports" r
	JOIN "community_posts" rp ON rp."id" = r."postId"
	WHERE rp."communityId" = c."id" AND r."status" = 'open')`;

/** Reported outranks the activity states: it is the one an admin must act on. */
const STATUS = `CASE
	WHEN ${OPEN_REPORTED_POSTS} > 0 THEN 'reported'
	WHEN c."lastActivityAt" > now() - interval '30 days' THEN 'active'
	ELSE 'inactive' END`;

const SIZE_BOUNDS: Record<AdminCommunitySize, [number, number | null]> = {
	[AdminCommunitySize.Small]: [0, 50],
	[AdminCommunitySize.Medium]: [50, 500],
	[AdminCommunitySize.Large]: [500, null],
};

const ROW_COLUMNS = `
  c."id", c."name", c."isOfficial", c."isPublic", c."categoryId",
  cat."label" AS "categoryLabel",
  cr."id" AS "creatorId", cr."fullName" AS "creatorName",
  p."storageId" AS "creatorAvatar",
  (${MEMBER_COUNT})::int AS "memberCount",
  (SELECT count(*) FROM "community_posts" cp WHERE cp."communityId" = c."id" AND NOT cp."isHidden")::int AS "postCount",
  (SELECT count(*) FROM "community_posts" cp WHERE cp."communityId" = c."id" AND NOT cp."isHidden"
     AND cp."createdAt" > now() - interval '7 days')::int AS "postsThisWeek",
  ${OPEN_REPORTED_POSTS}::int AS "reportedPostCount",
  ${STATUS} AS "status",
  c."lastActivityAt", c."createdAt"
`;

const FROM = `
  FROM "communities" c
  LEFT JOIN "users" cr ON cr."id" = c."creatorId"
  LEFT JOIN "categories" cat ON cat."id" = c."categoryId"
  LEFT JOIN "user_photos" p ON p."userId" = cr."id" AND p."position" = 0
`;

const CSV_COLUMNS = [
	'Community',
	'Creator',
	'Category',
	'Visibility',
	'Members',
	'Posts this week',
	'Total posts',
	'Reported posts',
	'Status',
	'Last active',
	'Created',
] as const;

type CommunityRecord = {
	id: string;
	name: string;
	isOfficial: boolean;
	isPublic: boolean;
	categoryId: string | null;
	categoryLabel: string | null;
	creatorId: string | null;
	creatorName: string | null;
	creatorAvatar: string | null;
	memberCount: number;
	postCount: number;
	postsThisWeek: number;
	reportedPostCount: number;
	status: AdminCommunityStatus;
	lastActivityAt: Date;
	createdAt: Date;
};

type ReportRecord = {
	postId: string;
	communityId: string;
	communityName: string;
	authorId: string;
	authorName: string;
	authorAvatar: string | null;
	body: string | null;
	mediaStorageId: string | null;
	postedAt: Date;
	reportCount: number;
	reasons: { reason: CommunityReportReason; count: number }[];
	details: string[] | null;
	lastReportedAt: Date;
	reviewedByName: string | null;
};

@Injectable()
export class AdminCommunitiesService {
	constructor(
		private readonly dataSource: DataSource,
		private readonly storage: Storage,
		private readonly posts: CommunityPostsService,
	) {}

	async list(
		query: ListAdminCommunitiesQueryDto,
	): Promise<AdminCommunityPageDto> {
		const params: unknown[] = [];
		const where = this.whereFor(query, params);
		const [rows, [{ total }]] = await Promise.all([
			this.dataSource.query<CommunityRecord[]>(
				`SELECT ${ROW_COLUMNS} ${FROM} WHERE ${where}
         ORDER BY c."isOfficial" DESC, c."createdAt" DESC, c."id"
         LIMIT ${query.limit} OFFSET ${query.offset}`,
				params,
			),
			this.dataSource.query<{ total: number }[]>(
				`SELECT count(*)::int AS "total" ${FROM} WHERE ${where}`,
				params,
			),
		]);

		return {
			items: rows.map((row) => this.toRow(row)),
			page: new PageInfoDto(total, query),
		};
	}

	async stats(): Promise<AdminCommunityStatsDto> {
		const [row] = await this.dataSource.query<AdminCommunityStatsDto[]>(`
      SELECT
        (SELECT count(*) FROM "communities")::int AS "totalCommunities",
        (SELECT count(*) FROM "communities"
          WHERE "createdAt" >= date_trunc('month', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos')::int AS "createdThisMonth",
        (SELECT count(*) FROM "communities" WHERE "lastActivityAt" > now() - interval '30 days')::int AS "activeCommunities",
        (SELECT count(*) FROM "communities" WHERE "lastActivityAt" > now() - interval '24 hours')::int AS "activeToday",
        (SELECT count(DISTINCT cp."communityId") FROM "community_reports" r
          JOIN "community_posts" cp ON cp."id" = r."postId" WHERE r."status" = 'open')::int AS "reportedCommunities",
        (SELECT count(DISTINCT "postId") FROM "community_reports" WHERE "status" = 'open')::int AS "openReports",
        (SELECT count(*) FROM "community_members")::int AS "totalMembers",
        (SELECT count(*) FROM "community_members" WHERE "createdAt" > now() - interval '7 days')::int AS "membersThisWeek"
    `);

		return row;
	}

	async findOne(id: string): Promise<AdminCommunityDetailDto> {
		const [[row], extra, activity, faces] = await Promise.all([
			this.dataSource.query<CommunityRecord[]>(
				`SELECT ${ROW_COLUMNS} ${FROM} WHERE c."id" = $1`,
				[id],
			),
			this.dataSource.query<
				{
					description: string | null;
					coverStorageId: string | null;
					membersThisWeek: number;
				}[]
			>(
				`SELECT c."description", c."coverStorageId",
           (SELECT count(*) FROM "community_members" m WHERE m."communityId" = c."id"
              AND m."createdAt" > now() - interval '7 days')::int AS "membersThisWeek"
         FROM "communities" c WHERE c."id" = $1`,
				[id],
			),
			this.dataSource.query<CommunityActivityDto[]>(
				`(SELECT 'joined' AS "kind", u."fullName" AS "actorName", NULL AS "excerpt", m."createdAt" AS "occurredAt"
            FROM "community_members" m JOIN "users" u ON u."id" = m."userId"
           WHERE m."communityId" = $1 ORDER BY m."createdAt" DESC LIMIT 6)
         UNION ALL
         (SELECT 'posted', u."fullName", left(cp."body", 80), cp."createdAt"
            FROM "community_posts" cp JOIN "users" u ON u."id" = cp."authorId"
           WHERE cp."communityId" = $1 AND NOT cp."isHidden" ORDER BY cp."createdAt" DESC LIMIT 6)
         ORDER BY "occurredAt" DESC LIMIT 6`,
				[id],
			),
			this.dataSource.query<
				{ id: string; fullName: string; avatar: string | null }[]
			>(
				`SELECT u."id", u."fullName", p."storageId" AS "avatar"
           FROM "community_members" m
           JOIN "users" u ON u."id" = m."userId"
           LEFT JOIN "user_photos" p ON p."userId" = u."id" AND p."position" = 0
          WHERE m."communityId" = $1
          ORDER BY m."isAdmin" DESC, m."createdAt" LIMIT 6`,
				[id],
			),
		]);

		if (!row) throw this.notFound();

		return {
			...this.toRow(row),
			description: extra[0]?.description ?? null,
			coverUrl: extra[0]?.coverStorageId
				? this.storage.buildUrl(extra[0].coverStorageId, 'full')
				: null,
			membersThisWeek: extra[0]?.membersThisWeek ?? 0,
			recentActivity: activity,
			memberPreview: faces.map((face) => ({
				id: face.id,
				fullName: face.fullName,
				avatarUrl: this.thumbnail(face.avatar),
			})),
		};
	}

	/** Every community matching the filters, newest first, capped at MAX_EXPORT_ROWS. */
	async exportCsv(filters: AdminCommunityFiltersDto): Promise<string> {
		const params: unknown[] = [];
		const where = this.whereFor(filters, params);
		const rows = await this.dataSource.query<CommunityRecord[]>(
			`SELECT ${ROW_COLUMNS} ${FROM} WHERE ${where}
       ORDER BY c."createdAt" DESC LIMIT ${MAX_EXPORT_ROWS}`,
			params,
		);

		return [
			csvLine([...CSV_COLUMNS]),
			...rows.map((row) =>
				csvLine([
					row.name,
					row.creatorName ?? (row.isOfficial ? 'Safety Team' : ''),
					row.categoryLabel,
					row.isPublic ? 'Public' : 'Private',
					row.memberCount,
					row.postsThisWeek,
					row.postCount,
					row.reportedPostCount,
					row.status,
					new Date(row.lastActivityAt).toISOString(),
					new Date(row.createdAt).toISOString(),
				]),
			),
		].join('');
	}

	private whereFor(
		filters: AdminCommunityFiltersDto,
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
				`(c."name" ILIKE ${pattern} OR cr."fullName" ILIKE ${pattern})`,
			);
		}
		if (filters.status)
			clauses.push(`(${STATUS}) = ${bind(filters.status)}`);
		if (filters.categoryId)
			clauses.push(`c."categoryId" = ${bind(filters.categoryId)}`);
		if (filters.size) {
			const [min, max] = SIZE_BOUNDS[filters.size];
			clauses.push(`(${MEMBER_COUNT}) >= ${bind(min)}`);
			if (max !== null) clauses.push(`(${MEMBER_COUNT}) < ${bind(max)}`);
		}

		return clauses.join(' AND ');
	}

	private toRow(row: CommunityRecord): AdminCommunityRowDto {
		return {
			id: row.id,
			name: row.name,
			isOfficial: row.isOfficial,
			isPublic: row.isPublic,
			categoryId: row.categoryId,
			categoryLabel: row.categoryLabel,
			creator: row.creatorId
				? {
						id: row.creatorId,
						fullName: row.creatorName ?? '',
						avatarUrl: this.thumbnail(row.creatorAvatar),
					}
				: null,
			memberCount: row.memberCount,
			postCount: row.postCount,
			postsThisWeek: row.postsThisWeek,
			reportedPostCount: row.reportedPostCount,
			status: row.status,
			lastActivityAt: row.lastActivityAt,
			createdAt: row.createdAt,
		};
	}

	/** Members lose it with its posts. The Safety Community cannot be deleted. */
	async remove(id: string): Promise<void> {
		const [community] = await this.dataSource.query<
			{ isOfficial: boolean }[]
		>(`SELECT "isOfficial" FROM "communities" WHERE "id" = $1`, [id]);

		if (!community) throw this.notFound();

		if (community.isOfficial) {
			throw new BadRequestException({
				code: 'COMMUNITY_OFFICIAL',
				message: 'The Safety Community cannot be deleted.',
			});
		}

		await this.dataSource.query(
			`DELETE FROM "communities" WHERE "id" = $1`,
			[id],
		);
	}

	async reports(
		query: ListCommunityReportsQueryDto,
	): Promise<ReportedPostPageDto> {
		const [rows, [{ total }]] = await Promise.all([
			this.dataSource.query<ReportRecord[]>(
				`SELECT cp."id" AS "postId", c."id" AS "communityId", c."name" AS "communityName",
           a."id" AS "authorId", a."fullName" AS "authorName", p."storageId" AS "authorAvatar",
           cp."body", cp."mediaStorageId", cp."createdAt" AS "postedAt",
           count(r."id")::int AS "reportCount",
           (SELECT json_agg(json_build_object('reason', x."reason", 'count', x."n") ORDER BY x."n" DESC)
              FROM (SELECT r2."reason", count(*)::int AS "n" FROM "community_reports" r2
                     WHERE r2."postId" = cp."id" AND r2."status" = $1 GROUP BY r2."reason") x) AS "reasons",
           (array_remove(array_agg(r."details" ORDER BY r."createdAt" DESC), NULL))[1:5] AS "details",
           max(r."createdAt") AS "lastReportedAt",
           max(rv."fullName") AS "reviewedByName"
         FROM "community_reports" r
         JOIN "community_posts" cp ON cp."id" = r."postId"
         JOIN "communities" c ON c."id" = cp."communityId"
         JOIN "users" a ON a."id" = cp."authorId"
         LEFT JOIN "user_photos" p ON p."userId" = a."id" AND p."position" = 0
         LEFT JOIN "users" rv ON rv."id" = r."reviewedById"
         WHERE r."status" = $1 AND ($4::uuid IS NULL OR c."id" = $4)
         GROUP BY cp."id", c."id", a."id", p."storageId"
         ORDER BY count(r."id") DESC, max(r."createdAt") DESC
         LIMIT $2 OFFSET $3`,
				[
					query.status,
					query.limit,
					query.offset,
					query.communityId ?? null,
				],
			),
			this.dataSource.query<{ total: number }[]>(
				`SELECT count(DISTINCT r."postId")::int AS "total" FROM "community_reports" r
           JOIN "community_posts" cp ON cp."id" = r."postId"
          WHERE r."status" = $1 AND ($2::uuid IS NULL OR cp."communityId" = $2)`,
				[query.status, query.communityId ?? null],
			),
		]);

		return {
			items: rows.map((row) => ({
				postId: row.postId,
				communityId: row.communityId,
				communityName: row.communityName,
				author: {
					id: row.authorId,
					fullName: row.authorName,
					avatarUrl: this.thumbnail(row.authorAvatar),
				},
				body: row.body,
				mediaUrl: row.mediaStorageId
					? this.storage.buildUrl(row.mediaStorageId, 'full')
					: null,
				postedAt: row.postedAt,
				reportCount: row.reportCount,
				reasons: row.reasons ?? [],
				details: row.details ?? [],
				lastReportedAt: row.lastReportedAt,
				status: query.status,
				reviewedByName: row.reviewedByName,
			})),
			page: new PageInfoDto(total, query),
		};
	}

	/**
	 * Every open report on the post is settled together. Removing hides the
	 * post rather than deleting it, so the reports keep what they were about.
	 */
	async resolve(
		adminId: string,
		postId: string,
		outcome:
			CommunityReportStatus.Dismissed | CommunityReportStatus.Removed,
	): Promise<void> {
		await this.dataSource.transaction(async (manager) => {
			const result: [unknown[], number] = await manager.query(
				`UPDATE "community_reports"
            SET "status" = $2, "reviewedById" = $3, "reviewedAt" = now(), "updatedAt" = now()
          WHERE "postId" = $1 AND "status" = 'open'`,
				[postId, outcome, adminId],
			);

			if (result[1] === 0) {
				throw new NotFoundException({
					code: 'COMMUNITY_REPORT_NOT_FOUND',
					message: 'That post has no open reports.',
				});
			}

			if (outcome === CommunityReportStatus.Removed) {
				await manager.query(
					`UPDATE "community_posts" SET "isHidden" = true, "isPinned" = false WHERE "id" = $1`,
					[postId],
				);
			}
		});
	}

	async officialPosts(
		adminId: string,
		query: PaginationQueryDto,
	): Promise<CommunityPostPageDto> {
		return this.posts.list(adminId, await this.officialId(), query);
	}

	async postOfficially(
		adminId: string,
		body: string,
	): Promise<CommunityPostDto> {
		return this.posts.create(adminId, await this.officialId(), { body });
	}

	private async officialId(): Promise<string> {
		const [row] = await this.dataSource.query<{ id: string }[]>(
			`SELECT "id" FROM "communities" WHERE "isOfficial" LIMIT 1`,
		);

		if (!row) throw this.notFound();

		return row.id;
	}

	private thumbnail(storageId: string | null): string | null {
		return storageId ? this.storage.buildUrl(storageId, 'thumbnail') : null;
	}

	private notFound(): NotFoundException {
		return new NotFoundException({
			code: 'COMMUNITY_NOT_FOUND',
			message: 'That community no longer exists.',
		});
	}
}
