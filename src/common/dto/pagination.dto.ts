import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_PAGE_SIZE = 20;

/** Caps the damage a client can do with a single request. */
export const MAX_PAGE_SIZE = 50;

export class PaginationQueryDto {
	@ApiPropertyOptional({
		minimum: 1,
		maximum: MAX_PAGE_SIZE,
		default: DEFAULT_PAGE_SIZE,
	})
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(MAX_PAGE_SIZE)
	@IsOptional()
	limit: number = DEFAULT_PAGE_SIZE;

	@ApiPropertyOptional({ minimum: 0, default: 0 })
	@Type(() => Number)
	@IsInt()
	@Min(0)
	@IsOptional()
	offset: number = 0;
}

export class PageInfoDto {
	@ApiProperty({
		description: 'Rows matching the filter, ignoring the page.',
	})
	total: number;

	@ApiProperty()
	limit: number;

	@ApiProperty()
	offset: number;

	constructor(total: number, query: PaginationQueryDto) {
		this.total = total;
		this.limit = query.limit;
		this.offset = query.offset;
	}
}
