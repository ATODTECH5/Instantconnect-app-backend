import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { TrimmedString } from '../../common/decorators/validation.decorators';

/** The reason sheet on the Delete Account frame, in its order. */
export const DELETION_REASONS = [
	'not_aligned',
	'expensive',
	'few_matches',
	'security',
	'poor_ui',
	'slow',
	'other',
] as const;

export type DeletionReason = (typeof DELETION_REASONS)[number];

export class RequestDeletionDto {
	@ApiProperty({ enum: DELETION_REASONS, example: 'few_matches' })
	@IsIn(DELETION_REASONS)
	reason: DeletionReason;

	@ApiPropertyOptional({
		description: 'Free text from the "additional details" box.',
		maxLength: 1000,
	})
	@IsOptional()
	@IsString()
	@TrimmedString()
	@MaxLength(1000)
	details?: string;
}
