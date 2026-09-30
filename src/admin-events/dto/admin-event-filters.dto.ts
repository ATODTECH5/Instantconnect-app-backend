import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination.dto';

/**
 * Worked out from the clock, the same way the app does: upcoming until it
 * starts, ongoing until it ends, past after. An event with no end time is
 * past once it starts.
 */
export const EVENT_STATUSES = ['upcoming', 'ongoing', 'past'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_TYPES = ['free', 'paid'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** On the start time: `next` windows look ahead from now, `last` ones back. */
export const EVENT_WINDOWS = [
	'next30d',
	'next90d',
	'last30d',
	'last90d',
	'last180d',
] as const;
export type EventWindow = (typeof EVENT_WINDOWS)[number];

const trimToUndefined = Transform(({ value }: { value: unknown }) =>
	typeof value === 'string' ? value.trim() || undefined : value,
);

/** Everything but the status, which the tab counts are grouped by. */
export class AdminEventFiltersDto {
	@ApiPropertyOptional({
		description:
			'Matches anywhere in the title or the host’s name, ignoring case.',
		maxLength: 100,
	})
	@IsOptional()
	@IsString()
	@MaxLength(100)
	@trimToUndefined
	search?: string;

	@ApiPropertyOptional({
		enum: EVENT_TYPES,
		description: 'Free is a price of zero.',
	})
	@IsOptional()
	@IsIn(EVENT_TYPES)
	type?: EventType;

	@ApiPropertyOptional({
		description: 'A category id from GET /reference/categories.',
		maxLength: 32,
	})
	@IsOptional()
	@IsString()
	@MaxLength(32)
	@trimToUndefined
	categoryId?: string;

	@ApiPropertyOptional({
		enum: EVENT_WINDOWS,
		description: 'Omit for all time.',
	})
	@IsOptional()
	@IsIn(EVENT_WINDOWS)
	window?: EventWindow;
}

export class AdminEventStatusFilterDto extends AdminEventFiltersDto {
	@ApiPropertyOptional({
		enum: EVENT_STATUSES,
		description: 'Omit for every event.',
	})
	@IsOptional()
	@IsIn(EVENT_STATUSES)
	status?: EventStatus;
}

export class ListAdminEventsQueryDto extends IntersectionType(
	AdminEventStatusFilterDto,
	PaginationQueryDto,
) {}
