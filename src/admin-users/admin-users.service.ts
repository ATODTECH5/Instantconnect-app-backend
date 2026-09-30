import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';

import { RefreshToken } from '../auth/entities/refresh-token.entity';

import { PageInfoDto } from '../common/dto/pagination.dto';
import { csvLine, escapeLike } from '../common/utils/csv.util';
import { Storage } from '../storage/storage';
import { SupportMessageDto } from '../support/dto/support-message.dto';
import { SupportService } from '../support/support.service';
import { KycStatus } from '../users/entities/kyc-status.enum';
import { UserStatus } from '../users/entities/user-status.enum';
import { User } from '../users/entities/user.entity';
import {
	AdminUserDetailDto,
	AdminUserPageDto,
	AdminUserRowDto,
} from './dto/admin-user.dto';
import {
	type AdminUserFiltersDto,
	type ExportAdminUsersQueryDto,
	type JoinedWithin,
	type ListAdminUsersQueryDto,
} from './dto/admin-user-filters.dto';
import { MessageAdminUserDto } from './dto/message-admin-user.dto';

const EXPORT_BATCH_SIZE = 500;

/** Past this the export needs a background job rather than a held-open request. */
export const MAX_EXPORT_ROWS = 10_000;

const JOINED_WITHIN_INTERVAL: Record<JoinedWithin, string> = {
	'30d': '30 days',
	'90d': '90 days',
	'6m': '6 months',
};

const CSV_COLUMNS = [
	'User ID',
	'Full name',
	'Email',
	'Phone',
	'Username',
	'Date of birth',
	'Location',
	'Status',
	'KYC status',
	'Plan',
	'Events attended',
	'Events created',
	'Connections',
	'Joined',
	'Last active',
] as const;

const ROW_COLUMNS = `
  u."id", u."fullName", u."email", u."status", u."kycStatus", u."createdAt",
  p."storageId" AS "avatarStorageId",
  (SELECT count(*) FROM "event_attendees" a WHERE a."userId" = u."id")::int AS "eventsAttended"
`;

const DETAIL_COLUMNS = `
  ${ROW_COLUMNS},
  u."phone", u."username", u."locationLabel", u."lastActiveAt",
  to_char(u."dateOfBirth", 'YYYY-MM-DD') AS "dateOfBirth",
  (SELECT count(*) FROM "events" e WHERE e."hostId" = u."id")::int AS "eventsCreated",
  (SELECT count(*) FROM "connections" c
    WHERE c."status" = 'accepted'
      AND (c."requesterId" = u."id" OR c."addresseeId" = u."id"))::int AS "connections"
`;

const FROM_MEMBERS = `
  FROM "users" u
  LEFT JOIN "user_photos" p ON p."userId" = u."id" AND p."position" = 0
`;

type RowRecord = {
	id: string;
	fullName: string;
	email: string;
	status: UserStatus;
	kycStatus: KycStatus;
	createdAt: Date;
	avatarStorageId: string | null;
	eventsAttended: number;
};

type DetailRecord = RowRecord & {
	phone: string;
	username: string | null;
	locationLabel: string | null;
	lastActiveAt: Date | null;
	dateOfBirth: string | null;
	eventsCreated: number;
	connections: number;
};

const isoOrNull = (date: Date | null) =>
	date ? new Date(date).toISOString() : null;

@Injectable()
export class AdminUsersService {
	constructor(
		private readonly dataSource: DataSource,
		private readonly storage: Storage,
		private readonly support: SupportService,
	) {}

	async list(query: ListAdminUsersQueryDto): Promise<AdminUserPageDto> {
		const params: unknown[] = [];
		const where = this.whereFor(query, params);

		const [rows, [{ total }]] = await Promise.all([
			this.dataSource.query<RowRecord[]>(
				`SELECT ${ROW_COLUMNS} ${FROM_MEMBERS} WHERE ${where}
         ORDER BY u."createdAt" DESC, u."id" DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
				[...params, query.limit, query.offset],
			),
			this.dataSource.query<{ total: number }[]>(
				`SELECT count(*)::int AS "total" FROM "users" u WHERE ${where}`,
				params,
			),
		]);

		return new AdminUserPageDto(
			rows.map((row) => this.toRow(row)),
			new PageInfoDto(total, query),
		);
	}

	async findOne(id: string): Promise<AdminUserDetailDto> {
		const [row] = await this.dataSource.query<DetailRecord[]>(
			`SELECT ${DETAIL_COLUMNS} ${FROM_MEMBERS}
       WHERE u."id" = $1 AND u."role" = 'user' AND u."deletedAt" IS NULL`,
			[id],
		);

		if (!row) {
			throw new NotFoundException({
				code: 'USER_NOT_FOUND',
				message: 'That account does not exist.',
			});
		}

		return {
			...this.toRow(row),
			phone: row.phone,
			username: row.username,
			dateOfBirth: row.dateOfBirth,
			location: row.locationLabel,
			lastActiveAt: isoOrNull(row.lastActiveAt),
			stats: {
				eventsAttended: row.eventsAttended,
				eventsCreated: row.eventsCreated,
				connections: row.connections,
			},
		};
	}

	/**
	 * Streams in keyset batches so memory stays flat whatever the row count, and
	 * a row inserted mid-export cannot shift a later batch the way OFFSET would.
	 */
	async *exportCsv(query: ExportAdminUsersQueryDto): AsyncGenerator<string> {
		yield csvLine([...CSV_COLUMNS]);

		// Kept as Postgres text: a JS Date drops the microseconds, and rows made in
		// the same millisecond would then fall between two batches.
		let after: { createdAt: string; id: string } | null = null;
		let written = 0;

		while (written < MAX_EXPORT_ROWS) {
			const params: unknown[] = [];
			let where = this.whereFor(query, params);

			if (after) {
				params.push(after.createdAt, after.id);
				where += ` AND (u."createdAt", u."id") < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
			}

			const batchSize = Math.min(
				EXPORT_BATCH_SIZE,
				MAX_EXPORT_ROWS - written,
			);
			const rows = await this.dataSource.query<
				(DetailRecord & { cursor: string })[]
			>(
				`SELECT ${DETAIL_COLUMNS}, u."createdAt"::text AS "cursor" ${FROM_MEMBERS} WHERE ${where}
         ORDER BY u."createdAt" DESC, u."id" DESC
         LIMIT $${params.length + 1}`,
				[...params, batchSize],
			);

			for (const row of rows) {
				yield csvLine([
					row.id,
					row.fullName,
					row.email,
					row.phone,
					row.username,
					row.dateOfBirth,
					row.locationLabel,
					row.status,
					row.kycStatus,
					'free',
					row.eventsAttended,
					row.eventsCreated,
					row.connections,
					isoOrNull(row.createdAt),
					isoOrNull(row.lastActiveAt),
				]);
			}

			written += rows.length;
			if (rows.length < batchSize) return;

			const last = rows[rows.length - 1];
			after = { createdAt: last.cursor, id: last.id };
		}
	}

	async message(
		adminId: string,
		userId: string,
		dto: MessageAdminUserDto,
	): Promise<SupportMessageDto> {
		const [admin] = await this.dataSource.query<{ fullName: string }[]>(
			`SELECT "fullName" FROM "users" WHERE "id" = $1`,
			[adminId],
		);
		const agentName = admin?.fullName.split(' ')[0] || 'Support';

		return this.support.reply(userId, agentName, dto.subject, dto.body);
	}

	/**
	 * Stored as `suspended`, which sign in, password reset, email verification
	 * and token refresh already refuse. Every session is revoked in the same
	 * transaction, so a signed in device is out when its access token expires.
	 */
	async disable(id: string): Promise<AdminUserDetailDto> {
		await this.memberOrFail(id);

		await this.dataSource.transaction(async (manager) => {
			await manager.update(User, id, { status: UserStatus.Suspended });
			await manager.update(
				RefreshToken,
				{ userId: id, revokedAt: IsNull() },
				{ revokedAt: new Date() },
			);
		});

		return this.findOne(id);
	}

	/** Back to where the member was: active once their email is verified. */
	async enable(id: string): Promise<AdminUserDetailDto> {
		await this.memberOrFail(id);

		await this.dataSource.query(
			`UPDATE "users"
       SET "status" = CASE WHEN "emailVerifiedAt" IS NULL
         THEN 'pending_verification' ELSE 'active' END::"users_status_enum",
         "updatedAt" = now()
       WHERE "id" = $1 AND "status" = 'suspended'`,
			[id],
		);

		return this.findOne(id);
	}

	/**
	 * The same soft delete a member does from Settings: the row stops answering
	 * to sign in, discovery and chat, and the email and phone are free to
	 * register again.
	 */
	async remove(id: string): Promise<void> {
		await this.memberOrFail(id);

		await this.dataSource.transaction(async (manager) => {
			await manager.update(
				RefreshToken,
				{ userId: id, revokedAt: IsNull() },
				{ revokedAt: new Date() },
			);
			await manager.update(User, id, {
				deletionReason: 'removed_by_admin',
			});
			await manager.softDelete(User, { id });
		});
	}

	private async memberOrFail(id: string): Promise<void> {
		const [row] = await this.dataSource.query<{ id: string }[]>(
			`SELECT "id" FROM "users"
       WHERE "id" = $1 AND "role" = 'user' AND "deletedAt" IS NULL`,
			[id],
		);

		if (!row) {
			throw new NotFoundException({
				code: 'USER_NOT_FOUND',
				message: 'That account does not exist.',
			});
		}
	}

	/** Members only: admins and deleted accounts never appear in the directory. */
	private whereFor(
		filters: AdminUserFiltersDto & { ids?: string[] },
		params: unknown[],
	): string {
		const bind = (value: unknown) => {
			params.push(value);
			return `$${params.length}`;
		};
		const clauses = [`u."role" = 'user'`, `u."deletedAt" IS NULL`];

		if (filters.search) {
			const pattern = bind(`%${escapeLike(filters.search)}%`);
			clauses.push(
				`(u."fullName" ILIKE ${pattern} OR u."email" ILIKE ${pattern})`,
			);
		}
		if (filters.status)
			clauses.push(`u."status" = ${bind(filters.status)}`);
		if (filters.kycStatus)
			clauses.push(`u."kycStatus" = ${bind(filters.kycStatus)}`);
		if (filters.plan && filters.plan !== 'free') clauses.push('FALSE');
		if (filters.joinedWithin) {
			clauses.push(
				`u."createdAt" >= now() - ${bind(JOINED_WITHIN_INTERVAL[filters.joinedWithin])}::interval`,
			);
		}
		if (filters.ids?.length)
			clauses.push(`u."id" = ANY(${bind(filters.ids)}::uuid[])`);

		return clauses.join(' AND ');
	}

	private toRow(row: RowRecord): AdminUserRowDto {
		return {
			id: row.id,
			fullName: row.fullName,
			email: row.email,
			avatarUrl: row.avatarStorageId
				? this.storage.buildUrl(row.avatarStorageId, 'thumbnail')
				: null,
			status: row.status,
			kycStatus: row.kycStatus,
			plan: 'free',
			eventsAttended: row.eventsAttended,
			joinedAt: new Date(row.createdAt).toISOString(),
		};
	}
}
