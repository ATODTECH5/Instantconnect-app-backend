import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
	ArrayMaxSize,
	ArrayUnique,
	IsArray,
	IsBoolean,
	IsEnum,
	IsInt,
	IsISO8601,
	IsLatitude,
	IsLongitude,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	Max,
	MaxLength,
	Min,
	ValidateNested,
} from 'class-validator';

import {
	PageInfoDto,
	PaginationQueryDto,
} from '../../common/dto/pagination.dto';
import { KycStatus } from '../../users/entities/kyc-status.enum';
import type { User } from '../../users/entities/user.entity';
import type { Event } from '../entities/event.entity';

const trim = Transform(({ value }: { value: unknown }) =>
	typeof value === 'string' ? value.trim() : value,
);

/** One notification each, raised inline, so the fan-out stays bounded. */
export const MAX_INVITEES = 50;

/** ₦10,000,000 in kobo. Well past any meetup ticket, and inside an int. */
export const MAX_PRICE_MINOR = 1_000_000_000;

/** Faces a list card shows before the rest collapse into "+N". */
export const INVITEE_PREVIEW = 3;

export class EventVenueDto {
	@ApiProperty({ maxLength: 120, example: 'Cozee Space' })
	@trim
	@IsString()
	@IsNotEmpty()
	@MaxLength(120)
	name!: string;

	@ApiPropertyOptional({
		maxLength: 255,
		example: '91 Orchard St, Lens bus stop',
	})
	@IsOptional()
	@trim
	@IsString()
	@MaxLength(255)
	address?: string;

	@ApiProperty({ example: 6.6018 })
	@IsLatitude()
	latitude!: number;

	@ApiProperty({ example: 3.3515 })
	@IsLongitude()
	longitude!: number;
}

/**
 * Times are checked for shape here and against the clock in the service,
 * since "in the future" depends on the moment the request lands.
 */
export class CreateEventDto {
	@ApiProperty({ maxLength: 80, example: 'Start-up Founders Meeting' })
	@trim
	@IsString()
	@IsNotEmpty()
	@MaxLength(80)
	title!: string;

	@ApiPropertyOptional({ maxLength: 1000 })
	@IsOptional()
	@trim
	@IsString()
	@MaxLength(1000)
	description?: string;

	@ApiProperty({ example: '2026-10-15T17:00:00.000Z' })
	@IsISO8601({ strict: true })
	startsAt!: string;

	@ApiPropertyOptional({ example: '2026-10-15T20:00:00.000Z' })
	@IsOptional()
	@IsISO8601({ strict: true })
	endsAt?: string;

	@ApiProperty({ type: EventVenueDto })
	@ValidateNested()
	@Type(() => EventVenueDto)
	venue!: EventVenueDto;

	@ApiPropertyOptional({ example: 'social', description: 'A category id.' })
	@IsOptional()
	@IsString()
	@MaxLength(32)
	categoryId?: string;

	@ApiProperty({
		minimum: 0,
		maximum: MAX_PRICE_MINOR,
		example: 0,
		description: 'Kobo. Zero is a free event.',
	})
	@IsInt()
	@Min(0)
	@Max(MAX_PRICE_MINOR)
	priceMinor!: number;

	@ApiProperty({ example: true })
	@IsBoolean()
	isPublic!: boolean;

	@ApiPropertyOptional({
		description: 'From POST /events/cover-upload-signature, once uploaded.',
	})
	@IsOptional()
	@IsString()
	@MaxLength(255)
	coverStorageId?: string;

	@ApiPropertyOptional({
		type: [String],
		maxItems: MAX_INVITEES,
		description: 'Accepted connections only.',
	})
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(MAX_INVITEES)
	@ArrayUnique()
	@IsUUID('4', { each: true })
	inviteeIds?: string[];
}

export enum EventTimeframe {
	Upcoming = 'upcoming',
	Past = 'past',
}

export class ListMyEventsQueryDto extends PaginationQueryDto {
	@ApiPropertyOptional({
		enum: EventTimeframe,
		enumName: 'EventTimeframe',
		default: EventTimeframe.Upcoming,
	})
	@IsOptional()
	@IsEnum(EventTimeframe)
	when: EventTimeframe = EventTimeframe.Upcoming;
}

export class EventPersonDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ example: 'Halima Lawal' })
	fullName: string;

	@ApiPropertyOptional({ nullable: true })
	avatarUrl: string | null;

	@ApiProperty({ example: false })
	isVerified: boolean;

	constructor(user: User, avatarUrl: string | null) {
		this.id = user.id;
		this.fullName = user.fullName;
		this.avatarUrl = avatarUrl;
		this.isVerified = user.kycStatus === KycStatus.Verified;
	}
}

export class EventVenueResponseDto {
	@ApiProperty({ example: 'Cozee Space' })
	name: string;

	@ApiPropertyOptional({ nullable: true })
	address: string | null;

	@ApiProperty({ example: 6.6018 })
	latitude: number;

	@ApiProperty({ example: 3.3515 })
	longitude: number;

	constructor(
		event: Pick<Event, 'venueName' | 'venueAddress' | 'venueLocation'>,
	) {
		this.name = event.venueName;
		this.address = event.venueAddress;
		this.latitude = event.venueLocation.coordinates[1];
		this.longitude = event.venueLocation.coordinates[0];
	}
}

export class EventCategoryDto {
	@ApiProperty({ example: 'social' })
	id: string;

	@ApiProperty({ example: 'Social' })
	label: string;

	constructor(id: string, label: string) {
		this.id = id;
		this.label = label;
	}
}

export class EventSummaryDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty()
	title: string;

	@ApiProperty()
	startsAt: Date;

	@ApiPropertyOptional({ nullable: true })
	endsAt: Date | null;

	@ApiProperty({ type: EventVenueResponseDto })
	venue: EventVenueResponseDto;

	@ApiPropertyOptional({ type: EventCategoryDto, nullable: true })
	category: EventCategoryDto | null;

	@ApiProperty({ description: 'Kobo. Zero is a free event.' })
	priceMinor: number;

	@ApiProperty()
	isPublic: boolean;

	@ApiPropertyOptional({ nullable: true })
	coverUrl: string | null;

	@ApiProperty()
	inviteeCount: number;

	@ApiProperty({
		type: [EventPersonDto],
		description: `The first ${INVITEE_PREVIEW} invitees, for the card's faces.`,
	})
	inviteePreview: EventPersonDto[];

	constructor(
		event: Event,
		coverUrl: string | null,
		inviteeCount: number,
		inviteePreview: EventPersonDto[],
	) {
		this.id = event.id;
		this.title = event.title;
		this.startsAt = event.startsAt;
		this.endsAt = event.endsAt;
		this.venue = new EventVenueResponseDto(event);
		this.category = event.category
			? new EventCategoryDto(event.category.id, event.category.label)
			: null;
		this.priceMinor = event.priceMinor;
		this.isPublic = event.isPublic;
		this.coverUrl = coverUrl;
		this.inviteeCount = inviteeCount;
		this.inviteePreview = inviteePreview;
	}
}

export class EventPageDto {
	@ApiProperty({ type: [EventSummaryDto] })
	items: EventSummaryDto[];

	@ApiProperty({ type: PageInfoDto })
	page: PageInfoDto;

	constructor(items: EventSummaryDto[], page: PageInfoDto) {
		this.items = items;
		this.page = page;
	}
}

export class EventDetailDto extends EventSummaryDto {
	@ApiPropertyOptional({ nullable: true })
	description: string | null;

	@ApiProperty({ type: EventPersonDto })
	host: EventPersonDto;

	@ApiProperty({ description: 'True when the viewer is the host.' })
	isHost: boolean;

	@ApiProperty({
		type: [EventPersonDto],
		description:
			'Everyone invited. Only the host sees this; others get [].',
	})
	invitees: EventPersonDto[];

	@ApiProperty()
	createdAt: Date;

	constructor(
		event: Event,
		coverUrl: string | null,
		host: EventPersonDto,
		isHost: boolean,
		invitees: EventPersonDto[],
		inviteeCount: number,
	) {
		super(
			event,
			coverUrl,
			inviteeCount,
			invitees.slice(0, INVITEE_PREVIEW),
		);
		this.description = event.description;
		this.host = host;
		this.isHost = isHost;
		this.invitees = invitees;
		this.createdAt = event.createdAt;
	}
}

export class RecentVenueDto extends EventVenueResponseDto {}
