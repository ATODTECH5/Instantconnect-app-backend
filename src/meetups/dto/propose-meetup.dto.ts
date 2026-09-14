import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	ArrayMaxSize,
	ArrayMinSize,
	ArrayUnique,
	IsArray,
	IsISO8601,
	IsLatitude,
	IsLongitude,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
	ValidateNested,
} from 'class-validator';

/** The Propose a Time card has room for a handful of pills, not a calendar. */
export const MAX_PROPOSED_TIMES = 5;

export class MeetupVenueDto {
	@ApiProperty({ maxLength: 120, example: 'Riverside Co-working Space' })
	@IsString()
	@IsNotEmpty()
	@MaxLength(120)
	name!: string;

	@ApiPropertyOptional({ maxLength: 255, example: '12 Allen Avenue, Ikeja' })
	@IsOptional()
	@IsString()
	@MaxLength(255)
	address?: string;

	@ApiPropertyOptional({ example: 6.6018 })
	@IsOptional()
	@IsLatitude()
	latitude?: number;

	@ApiPropertyOptional({ example: 3.3515 })
	@IsOptional()
	@IsLongitude()
	longitude?: number;
}

/**
 * Times are validated for shape here and for being in the future in the
 * service, since "future" depends on the clock at the moment of the request.
 */
export class ProposedTimesDto {
	@ApiProperty({
		type: [String],
		minItems: 1,
		maxItems: MAX_PROPOSED_TIMES,
		example: ['2026-09-20T15:00:00.000Z', '2026-09-21T11:00:00.000Z'],
	})
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(MAX_PROPOSED_TIMES)
	@ArrayUnique()
	@IsISO8601({ strict: true }, { each: true })
	proposedTimes!: string[];
}

export class ProposeMeetupDto extends ProposedTimesDto {
	@ApiProperty({ format: 'uuid' })
	@IsUUID()
	conversationId!: string;

	@ApiPropertyOptional({ type: MeetupVenueDto })
	@IsOptional()
	@ValidateNested()
	@Type(() => MeetupVenueDto)
	venue?: MeetupVenueDto;
}

/** A counter-proposal replaces the times and flips who must answer. */
export class CounterMeetupDto extends ProposedTimesDto {}
