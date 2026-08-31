import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
	IsBoolean,
	IsInt,
	IsOptional,
	IsString,
	Max,
	Min,
} from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export const DEFAULT_RADIUS_KM = 50;

/** Past this the result stops being "near you" and the index stops helping. */
export const MAX_RADIUS_KM = 500;

export class DiscoveryQueryDto extends PaginationQueryDto {
	@ApiPropertyOptional({
		description: 'A category id from GET /reference/categories.',
		example: 'business',
	})
	@IsString()
	@IsOptional()
	categoryId?: string;

	@ApiPropertyOptional({
		minimum: 1,
		maximum: MAX_RADIUS_KM,
		default: DEFAULT_RADIUS_KM,
	})
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(MAX_RADIUS_KM)
	@IsOptional()
	radiusKm: number = DEFAULT_RADIUS_KM;

	@ApiPropertyOptional({
		description: 'Restrict to accounts that have passed KYC.',
		default: false,
	})
	@Transform(
		({ value }: { value: unknown }) => value === true || value === 'true',
	)
	@IsBoolean()
	@IsOptional()
	verifiedOnly: boolean = false;
}
