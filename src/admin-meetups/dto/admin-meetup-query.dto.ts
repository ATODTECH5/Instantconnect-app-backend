import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { TrimmedString } from '../../common/decorators/validation.decorators';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

/**
 * Ongoing is a meetup that is active, or scheduled with at least one person
 * already on their way: a meetup next week that nobody has set off for is not
 * live. Past is one that ended.
 */
export const MEETUP_VIEWS = ['ongoing', 'past'] as const;
export type MeetupView = (typeof MEETUP_VIEWS)[number];

export class ListAdminMeetupsQueryDto extends PaginationQueryDto {
	@ApiProperty({ enum: MEETUP_VIEWS })
	@IsIn(MEETUP_VIEWS)
	view!: MeetupView;
}

export class FlagMeetupDto {
	@ApiProperty({
		maxLength: 300,
		example: 'Location sharing stopped just after arrival.',
		description: 'For admins only; neither person sees it.',
	})
	@IsString()
	@TrimmedString()
	@IsNotEmpty({ message: 'Add a reason for the flag' })
	@MaxLength(300)
	reason!: string;
}
