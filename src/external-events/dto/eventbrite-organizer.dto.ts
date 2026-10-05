import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { PageInfoDto } from '../../common/dto/pagination.dto';
import type { EventbriteOrganizer } from '../entities/eventbrite-organizer.entity';

export class AddEventbriteOrganizerDto {
	@ApiProperty({
		maxLength: 300,
		description:
			'The organizer page link, such as https://www.eventbrite.com/o/seaside-toastmasters-4462726935, or just the number at its end.',
		example: 'https://www.eventbrite.com/o/seaside-toastmasters-4462726935',
	})
	@Transform(({ value }: { value: unknown }) =>
		typeof value === 'string' ? value.trim() : value,
	)
	@IsString()
	@IsNotEmpty()
	@MaxLength(300)
	organizer!: string;
}

export class UpdateEventbriteOrganizerDto {
	@ApiProperty({
		description:
			'Off stops importing new events. Events already imported stay until they end.',
	})
	@IsBoolean()
	isActive!: boolean;
}

export class EventbriteOrganizerDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ example: '4462726935' })
	organizerId: string;

	@ApiPropertyOptional({
		nullable: true,
		example: 'Seaside Toastmasters',
		description: 'Null until the first sync names it.',
	})
	name: string | null;

	@ApiProperty({ example: 'https://www.eventbrite.com/o/4462726935' })
	pageUrl: string;

	@ApiProperty()
	isActive: boolean;

	@ApiProperty({ description: 'Imported events that have not ended.' })
	upcomingEventCount: number;

	@ApiPropertyOptional({ nullable: true, format: 'date-time' })
	lastSyncedAt: Date | null;

	@ApiPropertyOptional({
		nullable: true,
		description: 'Why the last sync failed; null when it succeeded.',
	})
	lastSyncError: string | null;

	@ApiPropertyOptional({ nullable: true, example: 'John Wick' })
	addedByName: string | null;

	@ApiProperty({ format: 'date-time' })
	createdAt: Date;

	constructor(organizer: EventbriteOrganizer, upcomingEventCount: number) {
		this.id = organizer.id;
		this.organizerId = organizer.organizerId;
		this.name = organizer.name;
		this.pageUrl = `https://www.eventbrite.com/o/${organizer.organizerId}`;
		this.isActive = organizer.isActive;
		this.upcomingEventCount = upcomingEventCount;
		this.lastSyncedAt = organizer.lastSyncedAt;
		this.lastSyncError = organizer.lastSyncError;
		this.addedByName = organizer.addedBy?.fullName ?? null;
		this.createdAt = organizer.createdAt;
	}
}

export class EventbriteOrganizerPageDto {
	@ApiProperty({
		description:
			'False when EVENTBRITE_TOKEN is not set on the server; nothing is imported then.',
	})
	tokenConfigured: boolean;

	@ApiProperty({ description: 'True while a sync of every organizer runs.' })
	isSyncing: boolean;

	@ApiProperty({ type: [EventbriteOrganizerDto] })
	items: EventbriteOrganizerDto[];

	@ApiProperty({ type: PageInfoDto })
	page: PageInfoDto;

	constructor(
		status: { tokenConfigured: boolean; isSyncing: boolean },
		items: EventbriteOrganizerDto[],
		page: PageInfoDto,
	) {
		this.tokenConfigured = status.tokenConfigured;
		this.isSyncing = status.isSyncing;
		this.items = items;
		this.page = page;
	}
}
