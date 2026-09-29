import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	ArrayMaxSize,
	IsEnum,
	IsIn,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
} from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { KycStatus } from '../../users/entities/kyc-status.enum';
import { UserStatus } from '../../users/entities/user-status.enum';

export const MAX_EXPORT_SELECTION = 500;

/** Subscriptions do not exist yet, so every member is on the free plan. */
export const USER_PLANS = ['free', 'premium', 'business'] as const;
export type UserPlan = (typeof USER_PLANS)[number];

export const JOINED_WITHIN = ['30d', '90d', '6m'] as const;
export type JoinedWithin = (typeof JOINED_WITHIN)[number];

/** Filters shared by the table and the CSV export, so both see the same rows. */
export class AdminUserFiltersDto {
	@ApiPropertyOptional({
		description: 'Matches anywhere in the name or email, ignoring case.',
		maxLength: 100,
	})
	@IsOptional()
	@IsString()
	@MaxLength(100)
	@Transform(({ value }: { value: unknown }) =>
		typeof value === 'string' ? value.trim() || undefined : value,
	)
	search?: string;

	@ApiPropertyOptional({ enum: UserStatus, enumName: 'UserStatus' })
	@IsOptional()
	@IsEnum(UserStatus)
	status?: UserStatus;

	@ApiPropertyOptional({ enum: KycStatus, enumName: 'KycStatus' })
	@IsOptional()
	@IsEnum(KycStatus)
	kycStatus?: KycStatus;

	@ApiPropertyOptional({
		enum: USER_PLANS,
		description: 'Everyone is on free until subscriptions exist.',
	})
	@IsOptional()
	@IsIn(USER_PLANS)
	plan?: UserPlan;

	@ApiPropertyOptional({
		enum: JOINED_WITHIN,
		description: 'Omit for all time.',
	})
	@IsOptional()
	@IsIn(JOINED_WITHIN)
	joinedWithin?: JoinedWithin;
}

export class ListAdminUsersQueryDto extends IntersectionType(
	AdminUserFiltersDto,
	PaginationQueryDto,
) {}

export class ExportAdminUsersQueryDto extends AdminUserFiltersDto {
	@ApiPropertyOptional({
		description:
			'Comma separated user ids. When present only these are exported, still subject to the filters.',
		example: 'd30f0254-2b7d-404c-8035-73dda8fb4342,6a1c…',
	})
	@IsOptional()
	@Transform(({ value }: { value: unknown }) =>
		typeof value === 'string'
			? value
					.split(',')
					.map((id) => id.trim())
					.filter(Boolean)
			: value,
	)
	@ArrayMaxSize(MAX_EXPORT_SELECTION)
	@IsUUID('4', { each: true })
	ids?: string[];
}
