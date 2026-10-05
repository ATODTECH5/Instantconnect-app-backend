import {
	ApiProperty,
	ApiPropertyOptional,
	IntersectionType,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	IsEnum,
	IsNotEmpty,
	IsUUID,
	IsOptional,
	IsString,
	MaxLength,
} from 'class-validator';

import {
	PageInfoDto,
	PaginationQueryDto,
} from '../../common/dto/pagination.dto';
import {
	CommunityReportReason,
	CommunityReportStatus,
} from '../../communities/entities/community-report.entity';

const trim = Transform(({ value }: { value: unknown }) =>
	typeof value === 'string' ? value.trim() : value,
);

export enum AdminCommunityStatus {
	/** A post or comment in the last 30 days. */
	Active = 'active',
	Inactive = 'inactive',
	/** Has posts with open reports. */
	Reported = 'reported',
}

export enum AdminCommunitySize {
	/** Under 50 members. */
	Small = 'small',
	/** 50 to 499. */
	Medium = 'medium',
	/** 500 or more. */
	Large = 'large',
}

/** Shared by the table and the CSV export, so both see the same rows. */
export class AdminCommunityFiltersDto {
	@ApiPropertyOptional({ maxLength: 60, description: 'Name or creator.' })
	@IsOptional()
	@trim
	@IsString()
	@MaxLength(60)
	search?: string;

	@ApiPropertyOptional({
		enum: AdminCommunityStatus,
		enumName: 'AdminCommunityStatus',
	})
	@IsOptional()
	@IsEnum(AdminCommunityStatus)
	status?: AdminCommunityStatus;

	@ApiPropertyOptional({ example: 'social' })
	@IsOptional()
	@IsString()
	@MaxLength(32)
	categoryId?: string;

	@ApiPropertyOptional({
		enum: AdminCommunitySize,
		enumName: 'AdminCommunitySize',
	})
	@IsOptional()
	@IsEnum(AdminCommunitySize)
	size?: AdminCommunitySize;
}

export class ListAdminCommunitiesQueryDto extends IntersectionType(
	PaginationQueryDto,
	AdminCommunityFiltersDto,
) {}

export class AdminPersonDto {
	@ApiProperty({ format: 'uuid' })
	id!: string;

	@ApiProperty()
	fullName!: string;

	@ApiPropertyOptional({ nullable: true })
	avatarUrl!: string | null;
}

export class AdminCommunityRowDto {
	@ApiProperty({ format: 'uuid' })
	id!: string;

	@ApiProperty()
	name!: string;

	@ApiProperty()
	isOfficial!: boolean;

	@ApiProperty()
	isPublic!: boolean;

	@ApiPropertyOptional({ nullable: true })
	categoryLabel!: string | null;

	@ApiPropertyOptional({ type: AdminPersonDto, nullable: true })
	creator!: AdminPersonDto | null;

	@ApiProperty({
		description: 'Every active member for the Safety Community.',
	})
	memberCount!: number;

	@ApiProperty()
	postCount!: number;

	@ApiProperty({ description: 'Posts with open reports.' })
	reportedPostCount!: number;

	@ApiProperty({ description: 'In the last 7 days.' })
	postsThisWeek!: number;

	@ApiPropertyOptional({ nullable: true, example: 'social' })
	categoryId!: string | null;

	@ApiProperty({
		enum: AdminCommunityStatus,
		enumName: 'AdminCommunityStatus',
	})
	status!: AdminCommunityStatus;

	@ApiProperty()
	lastActivityAt!: Date;

	@ApiProperty()
	createdAt!: Date;
}

export class AdminCommunityPageDto {
	@ApiProperty({ type: [AdminCommunityRowDto] })
	items!: AdminCommunityRowDto[];

	@ApiProperty({ type: PageInfoDto })
	page!: PageInfoDto;
}

export class AdminCommunityStatsDto {
	@ApiProperty({
		description: 'Every community, the Safety Community included.',
	})
	totalCommunities!: number;

	@ApiProperty({ description: 'Created since the 1st of this month.' })
	createdThisMonth!: number;

	@ApiProperty({ description: 'A post or comment in the last 30 days.' })
	activeCommunities!: number;

	@ApiProperty({ description: 'A post or comment in the last 24 hours.' })
	activeToday!: number;

	@ApiProperty({ description: 'Communities with posts waiting for review.' })
	reportedCommunities!: number;

	@ApiProperty({ description: 'Posts waiting for review.' })
	openReports!: number;

	@ApiProperty({
		description: 'Membership rows, the Safety Community aside.',
	})
	totalMembers!: number;

	@ApiProperty({ description: 'Memberships started in the last 7 days.' })
	membersThisWeek!: number;
}

export class CommunityActivityDto {
	@ApiProperty({ enum: ['joined', 'posted'] })
	kind!: 'joined' | 'posted';

	@ApiProperty()
	actorName!: string;

	@ApiPropertyOptional({
		nullable: true,
		description: 'The start of the post, for posted.',
	})
	excerpt!: string | null;

	@ApiProperty()
	occurredAt!: Date;
}

export class AdminCommunityDetailDto extends AdminCommunityRowDto {
	@ApiPropertyOptional({ nullable: true })
	description!: string | null;

	@ApiPropertyOptional({ nullable: true })
	coverUrl!: string | null;

	@ApiProperty()
	membersThisWeek!: number;

	@ApiProperty({
		type: [CommunityActivityDto],
		description: 'Newest first, at most six.',
	})
	recentActivity!: CommunityActivityDto[];

	@ApiProperty({ type: [AdminPersonDto], description: 'Up to six faces.' })
	memberPreview!: AdminPersonDto[];
}

export class ListCommunityReportsQueryDto extends PaginationQueryDto {
	@ApiPropertyOptional({ format: 'uuid', description: 'One community only.' })
	@IsOptional()
	@IsUUID('4')
	communityId?: string;

	@ApiPropertyOptional({
		enum: CommunityReportStatus,
		enumName: 'CommunityReportStatus',
		default: CommunityReportStatus.Open,
	})
	@IsOptional()
	@IsEnum(CommunityReportStatus)
	status: CommunityReportStatus = CommunityReportStatus.Open;
}

export class ReportReasonCountDto {
	@ApiProperty({
		enum: CommunityReportReason,
		enumName: 'CommunityReportReason',
	})
	reason!: CommunityReportReason;

	@ApiProperty()
	count!: number;
}

/** Reports grouped by post, so one post reported ten times is one row. */
export class ReportedPostDto {
	@ApiProperty({ format: 'uuid' })
	postId!: string;

	@ApiProperty({ format: 'uuid' })
	communityId!: string;

	@ApiProperty()
	communityName!: string;

	@ApiProperty({ type: AdminPersonDto })
	author!: AdminPersonDto;

	@ApiPropertyOptional({ nullable: true })
	body!: string | null;

	@ApiPropertyOptional({ nullable: true })
	mediaUrl!: string | null;

	@ApiProperty()
	postedAt!: Date;

	@ApiProperty()
	reportCount!: number;

	@ApiProperty({ type: [ReportReasonCountDto] })
	reasons!: ReportReasonCountDto[];

	@ApiProperty({
		type: [String],
		description: 'Details reporters added, newest first, at most five.',
	})
	details!: string[];

	@ApiProperty()
	lastReportedAt!: Date;

	@ApiProperty({
		enum: CommunityReportStatus,
		enumName: 'CommunityReportStatus',
	})
	status!: CommunityReportStatus;

	@ApiPropertyOptional({ nullable: true })
	reviewedByName!: string | null;
}

export class ReportedPostPageDto {
	@ApiProperty({ type: [ReportedPostDto] })
	items!: ReportedPostDto[];

	@ApiProperty({ type: PageInfoDto })
	page!: PageInfoDto;
}

export class CreateOfficialPostDto {
	@ApiProperty({ maxLength: 2000 })
	@trim
	@IsString()
	@IsNotEmpty()
	@MaxLength(2000)
	body!: string;
}
