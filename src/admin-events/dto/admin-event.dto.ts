import { ApiProperty } from '@nestjs/swagger';

import { PageInfoDto } from '../../common/dto/pagination.dto';
import { EVENT_STATUSES, type EventStatus } from './admin-event-filters.dto';

export class AdminEventHostDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ example: 'Halima Lawal' })
	fullName: string;

	@ApiProperty({ format: 'email' })
	email: string;

	@ApiProperty({ nullable: true, type: String })
	avatarUrl: string | null;

	@ApiProperty({
		description: 'The host deleted their account; the event stays.',
	})
	isDeleted: boolean;
}

export class AdminEventCategoryDto {
	@ApiProperty({ example: 'social' })
	id: string;

	@ApiProperty({ example: 'Social' })
	label: string;
}

export class AdminEventRowDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ example: 'Lagos Tech Summit' })
	title: string;

	@ApiProperty({ type: AdminEventHostDto })
	host: AdminEventHostDto;

	@ApiProperty({ type: AdminEventCategoryDto, nullable: true })
	category: AdminEventCategoryDto | null;

	@ApiProperty({ enum: EVENT_STATUSES })
	status: EventStatus;

	@ApiProperty({ format: 'date-time' })
	startsAt: string;

	@ApiProperty({ format: 'date-time', nullable: true, type: String })
	endsAt: string | null;

	@ApiProperty({
		description: 'Kobo. Zero is a free event.',
		example: 500000,
	})
	priceMinor: number;

	@ApiProperty({ description: 'Off means invite only.' })
	isPublic: boolean;

	@ApiProperty({ example: 24 })
	attendees: number;

	@ApiProperty({ format: 'date-time' })
	createdAt: string;
}

export class AdminEventCountsDto {
	@ApiProperty({ example: 486 })
	all: number;

	@ApiProperty({ example: 30 })
	upcoming: number;

	@ApiProperty({ example: 4 })
	ongoing: number;

	@ApiProperty({ example: 452 })
	past: number;
}

export class AdminEventPageDto {
	@ApiProperty({
		type: [AdminEventRowDto],
		description: 'Newest created first.',
	})
	items: AdminEventRowDto[];

	@ApiProperty({ type: PageInfoDto })
	page: PageInfoDto;

	@ApiProperty({
		type: AdminEventCountsDto,
		description:
			'Per status for the same search and filters, for the tab badges.',
	})
	counts: AdminEventCountsDto;

	constructor(
		items: AdminEventRowDto[],
		page: PageInfoDto,
		counts: AdminEventCountsDto,
	) {
		this.items = items;
		this.page = page;
		this.counts = counts;
	}
}

export class AdminEventAttendeeDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ example: 'Chidi Okonkwo' })
	fullName: string;

	@ApiProperty({ nullable: true, type: String })
	avatarUrl: string | null;

	@ApiProperty({ nullable: true, type: String, example: 'Product Designer' })
	occupation: string | null;

	@ApiProperty({
		format: 'date-time',
		description: 'When they said they were going.',
	})
	joinedAt: string;
}

export class AdminEventDetailDto extends AdminEventRowDto {
	@ApiProperty({ nullable: true, type: String })
	description: string | null;

	@ApiProperty({ example: 'Landmark Event Centre' })
	venueName: string;

	@ApiProperty({
		nullable: true,
		type: String,
		example: 'Water Corporation Dr, Victoria Island',
	})
	venueAddress: string | null;

	@ApiProperty({ nullable: true, type: String })
	coverUrl: string | null;

	@ApiProperty({ description: 'Connections the host invited.', example: 12 })
	invited: number;

	@ApiProperty({
		type: [AdminEventAttendeeDto],
		description: `The most recent ${20} to say they are going. \`attendees\` is the full count.`,
	})
	recentAttendees: AdminEventAttendeeDto[];

	@ApiProperty({
		description: 'Kobo. Always zero until tickets can be bought.',
		example: 0,
	})
	revenueMinor: number;
}

export class AdminEventStatsDto {
	@ApiProperty({ example: 486 })
	total: number;

	@ApiProperty({ description: 'Upcoming or still running.', example: 34 })
	upcoming: number;

	@ApiProperty({ example: 452 })
	past: number;

	@ApiProperty({
		description: 'Kobo. Always zero until tickets can be bought.',
		example: 0,
	})
	revenueMinor: number;
}
