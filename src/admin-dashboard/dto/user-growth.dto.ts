import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_GROWTH_MONTHS = 12;
export const MAX_GROWTH_MONTHS = 24;

export class UserGrowthQueryDto {
	@ApiPropertyOptional({
		description:
			'How many calendar months to return, ending with this one.',
		minimum: 1,
		maximum: MAX_GROWTH_MONTHS,
		default: DEFAULT_GROWTH_MONTHS,
	})
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(MAX_GROWTH_MONTHS)
	@IsOptional()
	months: number = DEFAULT_GROWTH_MONTHS;
}

export class UserGrowthPointDto {
	@ApiProperty({
		description: 'Calendar month in Lagos time.',
		example: '2026-09',
	})
	month: string;

	@ApiProperty({ example: 312 })
	newUsers: number;
}

export class UserGrowthDto {
	@ApiProperty({
		type: [UserGrowthPointDto],
		description:
			'Oldest first. A month with no sign ups is present with 0.',
	})
	points: UserGrowthPointDto[];

	constructor(points: UserGrowthPointDto[]) {
		this.points = points;
	}
}
