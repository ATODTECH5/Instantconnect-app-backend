import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	IsEnum,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
} from 'class-validator';

import {
	PageInfoDto,
	PaginationQueryDto,
} from '../../common/dto/pagination.dto';
import { UserStatus } from '../../users/entities/user-status.enum';
import {
	UserReportReason,
	UserReportSource,
	UserReportStatus,
} from '../entities/user-report.entity';

const trim = Transform(({ value }: { value: unknown }) =>
	typeof value === 'string' ? value.trim() : value,
);

export class CreateUserReportDto {
	@ApiProperty({ format: 'uuid', description: 'The member being reported.' })
	@IsUUID()
	userId!: string;

	@ApiProperty({ enum: UserReportReason, enumName: 'UserReportReason' })
	@IsEnum(UserReportReason)
	reason!: UserReportReason;

	@ApiProperty({ enum: UserReportSource, enumName: 'UserReportSource' })
	@IsEnum(UserReportSource)
	source!: UserReportSource;

	@ApiPropertyOptional({ maxLength: 1000 })
	@IsOptional()
	@trim
	@IsString()
	@MaxLength(1000)
	details?: string;
}

export class ListUserReportsQueryDto extends PaginationQueryDto {
	@ApiPropertyOptional({
		enum: UserReportStatus,
		enumName: 'UserReportStatus',
		default: UserReportStatus.Open,
	})
	@IsOptional()
	@IsEnum(UserReportStatus)
	status: UserReportStatus = UserReportStatus.Open;
}

export class UserReportPartyDto {
	@ApiProperty({ format: 'uuid' })
	id!: string;

	@ApiProperty()
	fullName!: string;

	@ApiProperty()
	email!: string;

	@ApiProperty({ enum: UserStatus, enumName: 'UserStatus' })
	status!: UserStatus;
}

export class AdminUserReportDto {
	@ApiProperty({ format: 'uuid' })
	id!: string;

	@ApiProperty({ type: UserReportPartyDto })
	reporter!: UserReportPartyDto;

	@ApiProperty({ type: UserReportPartyDto })
	reportedUser!: UserReportPartyDto;

	@ApiProperty({
		description: 'Open reports against the reported member, from anyone.',
	})
	openReportsAgainst!: number;

	@ApiProperty({ enum: UserReportReason, enumName: 'UserReportReason' })
	reason!: UserReportReason;

	@ApiPropertyOptional({ nullable: true })
	details!: string | null;

	@ApiProperty({ enum: UserReportSource, enumName: 'UserReportSource' })
	source!: UserReportSource;

	@ApiProperty({ enum: UserReportStatus, enumName: 'UserReportStatus' })
	status!: UserReportStatus;

	@ApiProperty({ format: 'date-time' })
	createdAt!: string;

	@ApiPropertyOptional({ format: 'date-time', nullable: true })
	reviewedAt!: string | null;
}

export class AdminUserReportPageDto {
	@ApiProperty({ type: [AdminUserReportDto] })
	items: AdminUserReportDto[];

	@ApiProperty({ type: PageInfoDto })
	page: PageInfoDto;

	constructor(items: AdminUserReportDto[], page: PageInfoDto) {
		this.items = items;
		this.page = page;
	}
}
