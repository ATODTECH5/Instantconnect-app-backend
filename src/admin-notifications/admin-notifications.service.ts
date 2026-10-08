import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import {
	PageInfoDto,
	type PaginationQueryDto,
} from '../common/dto/pagination.dto';
import {
	AdminNotificationDto,
	AdminNotificationKind,
	AdminNotificationPageDto,
} from './dto/admin-notification.dto';
import { AdminNotificationCursor } from './entities/admin-notification-cursor.entity';
import { AdminNotificationRead } from './entities/admin-notification-read.entity';

/** Older activity is on its own page already; the bell is for what is new. */
const FEED_WINDOW = `now() - interval '30 days'`;

const SUPPORT_PREVIEW_LENGTH = 120;

const FEED = `
  SELECT 'kyc_submitted:' || k."id" AS "id", 'kyc_submitted' AS "kind", k."id" AS "targetId",
         k."createdAt" AS "occurredAt", u."fullName", NULL::text AS "detail"
    FROM "kyc_submissions" k
    JOIN "users" u ON u."id" = k."userId" AND u."deletedAt" IS NULL
   WHERE k."createdAt" > ${FEED_WINDOW}
  UNION ALL
  SELECT 'support_message:' || s."id", 'support_message', u."id",
         s."createdAt", u."fullName", left(s."body", ${SUPPORT_PREVIEW_LENGTH})
    FROM "support_messages" s
    JOIN "users" u ON u."id" = s."userId" AND u."deletedAt" IS NULL
   WHERE s."direction" = 'inbound' AND s."createdAt" > ${FEED_WINDOW}
  UNION ALL
  SELECT 'event_created:' || e."id", 'event_created', e."id",
         e."createdAt", u."fullName", e."title"
    FROM "events" e
    JOIN "users" u ON u."id" = e."hostId" AND u."deletedAt" IS NULL
   WHERE e."createdAt" > ${FEED_WINDOW}
  UNION ALL
  SELECT 'user_reported:' || r."id", 'user_reported', r."id",
         r."createdAt", u."fullName", r."reason"::text
    FROM "user_reports" r
    JOIN "users" u ON u."id" = r."reportedUserId"
   WHERE r."createdAt" > ${FEED_WINDOW}
`;

/** $1 is the admin. */
const WITH_READ_STATE = `
  SELECT f.*,
         COALESCE(f."occurredAt" <= c."readAllAt", false) OR r."notificationId" IS NOT NULL AS "read"
    FROM (${FEED}) f
    LEFT JOIN "admin_notification_cursors" c ON c."adminId" = $1
    LEFT JOIN "admin_notification_reads" r ON r."adminId" = $1 AND r."notificationId" = f."id"
`;

type FeedRow = {
	id: string;
	kind: AdminNotificationKind;
	targetId: string;
	occurredAt: Date;
	fullName: string;
	detail: string | null;
	read: boolean;
};

@Injectable()
export class AdminNotificationsService {
	constructor(
		private readonly dataSource: DataSource,
		@InjectRepository(AdminNotificationRead)
		private readonly reads: Repository<AdminNotificationRead>,
		@InjectRepository(AdminNotificationCursor)
		private readonly cursors: Repository<AdminNotificationCursor>,
	) {}

	async list(
		adminId: string,
		query: PaginationQueryDto,
	): Promise<AdminNotificationPageDto> {
		const [rows, [counts]] = await Promise.all([
			this.dataSource.query<FeedRow[]>(
				`${WITH_READ_STATE} ORDER BY f."occurredAt" DESC, f."id" DESC LIMIT $2 OFFSET $3`,
				[adminId, query.limit, query.offset],
			),
			this.dataSource.query<{ total: number; unread: number }[]>(
				`SELECT count(*)::int AS "total",
                count(*) FILTER (WHERE NOT x."read")::int AS "unread"
           FROM (${WITH_READ_STATE}) x`,
				[adminId],
			),
		]);

		return new AdminNotificationPageDto(
			rows.map(toNotification),
			counts.unread,
			new PageInfoDto(counts.total, query),
		);
	}

	async markRead(adminId: string, ids: string[]): Promise<void> {
		await this.reads
			.createQueryBuilder()
			.insert()
			.into(AdminNotificationRead)
			.values(ids.map((notificationId) => ({ adminId, notificationId })))
			.orIgnore()
			.execute();
	}

	async markAllRead(adminId: string): Promise<void> {
		await this.dataSource.transaction(async (manager) => {
			await manager
				.getRepository(AdminNotificationCursor)
				.upsert({ adminId, readAllAt: new Date() }, ['adminId']);
			// The cursor now covers every mark, so they would only take up space.
			await manager
				.getRepository(AdminNotificationRead)
				.delete({ adminId });
		});
	}
}

function toNotification(row: FeedRow): AdminNotificationDto {
	return {
		id: row.id,
		kind: row.kind,
		targetId: row.targetId,
		...describe(row),
		occurredAt: new Date(row.occurredAt).toISOString(),
		read: row.read,
	};
}

function describe(row: FeedRow): Pick<AdminNotificationDto, 'title' | 'body'> {
	switch (row.kind) {
		case AdminNotificationKind.KycSubmitted:
			return {
				title: 'New KYC submission',
				body: `${row.fullName} sent documents for review`,
			};
		case AdminNotificationKind.SupportMessage:
			return {
				title: `Support message from ${row.fullName}`,
				body: row.detail ?? '',
			};
		case AdminNotificationKind.UserReported:
			return {
				title: 'Member reported',
				body: `${row.fullName} was reported for ${(row.detail ?? 'other').replace(/_/g, ' ')}`,
			};
		case AdminNotificationKind.EventCreated:
			return {
				title: 'New event',
				body: `${row.fullName} created '${row.detail}'`,
			};
	}
}
