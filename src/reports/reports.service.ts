import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';

import { PageInfoDto } from '../common/dto/pagination.dto';
import { User } from '../users/entities/user.entity';
import {
	AdminUserReportDto,
	AdminUserReportPageDto,
	type CreateUserReportDto,
	type ListUserReportsQueryDto,
	type UserReportPartyDto,
} from './dto/user-report.dto';
import { UserReport, UserReportStatus } from './entities/user-report.entity';

@Injectable()
export class ReportsService {
	constructor(
		@InjectRepository(UserReport)
		private readonly reports: Repository<UserReport>,
		@InjectRepository(User)
		private readonly users: Repository<User>,
	) {}

	/** Idempotent while a report from this member about that member is open. */
	async reportUser(
		reporterId: string,
		dto: CreateUserReportDto,
	): Promise<void> {
		if (reporterId === dto.userId) {
			throw new BadRequestException({
				code: 'CANNOT_REPORT_SELF',
				message: 'You cannot report yourself.',
			});
		}

		const exists = await this.users.exists({
			where: { id: dto.userId, deletedAt: IsNull() },
		});

		if (!exists) {
			throw new NotFoundException({
				code: 'USER_NOT_FOUND',
				message: 'That person is no longer available.',
			});
		}

		await this.reports
			.createQueryBuilder()
			.insert()
			.into(UserReport)
			.values({
				reporterId,
				reportedUserId: dto.userId,
				reason: dto.reason,
				source: dto.source,
				details: dto.details || null,
			})
			.orIgnore()
			.execute();
	}

	async list(
		query: ListUserReportsQueryDto,
	): Promise<AdminUserReportPageDto> {
		const [rows, total] = await this.reports.findAndCount({
			where: { status: query.status },
			relations: { reporter: true, reportedUser: true },
			withDeleted: true,
			order: {
				createdAt:
					query.status === UserReportStatus.Open ? 'ASC' : 'DESC',
			},
			take: query.limit,
			skip: query.offset,
		});
		const openCounts = await this.openCountsAgainst(
			rows.map((row) => row.reportedUserId),
		);

		return new AdminUserReportPageDto(
			rows.map((row) =>
				toDto(row, openCounts.get(row.reportedUserId) ?? 0),
			),
			new PageInfoDto(total, query),
		);
	}

	async review(
		adminId: string,
		id: string,
		status: UserReportStatus.Dismissed | UserReportStatus.Resolved,
	): Promise<void> {
		const result = await this.reports.update(
			{ id, status: UserReportStatus.Open },
			{ status, reviewedById: adminId, reviewedAt: new Date() },
		);

		if (!result.affected) {
			throw new NotFoundException({
				code: 'REPORT_NOT_FOUND',
				message: 'That report is gone or was already reviewed.',
			});
		}
	}

	private async openCountsAgainst(
		userIds: string[],
	): Promise<Map<string, number>> {
		if (userIds.length === 0) return new Map();

		const rows = await this.reports
			.createQueryBuilder('report')
			.select('report.reportedUserId', 'userId')
			.addSelect('COUNT(*)::int', 'count')
			.where({ reportedUserId: In([...new Set(userIds)]) })
			.andWhere('report.status = :open', { open: UserReportStatus.Open })
			.groupBy('report.reportedUserId')
			.getRawMany<{ userId: string; count: number }>();

		return new Map(rows.map((row) => [row.userId, row.count]));
	}
}

function toParty(user: User): UserReportPartyDto {
	return {
		id: user.id,
		fullName: user.fullName,
		email: user.email,
		status: user.status,
	};
}

function toDto(
	row: UserReport,
	openReportsAgainst: number,
): AdminUserReportDto {
	return {
		id: row.id,
		reporter: toParty(row.reporter),
		reportedUser: toParty(row.reportedUser),
		openReportsAgainst,
		reason: row.reason,
		details: row.details,
		source: row.source,
		status: row.status,
		createdAt: row.createdAt.toISOString(),
		reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
	};
}
