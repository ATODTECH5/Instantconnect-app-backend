import { ApiPropertyOptional } from '@nestjs/swagger';
import {
	ArrayMaxSize,
	ArrayUnique,
	IsArray,
	IsLatitude,
	IsLongitude,
	IsOptional,
	IsString,
	Matches,
	MaxLength,
	MinLength,
} from 'class-validator';

import { TrimmedString } from '../../common/decorators/validation.decorators';

/**
 * Every field is optional so the edit screen can PATCH just what changed. Null
 * is a meaningful value here: it clears the field, which is how a user removes
 * their bio or occupation.
 */
export class UpdateProfileDto {
	@ApiPropertyOptional({ example: 'Halima Lawal' })
	@IsOptional()
	@TrimmedString()
	@IsString()
	@MinLength(2)
	@MaxLength(80)
	fullName?: string;

	@ApiPropertyOptional({
		description:
			'Letters, numbers, underscore and dot. Stored without the leading @.',
		example: 'leemah',
	})
	@IsOptional()
	@TrimmedString()
	@Matches(/^[a-zA-Z0-9._]+$/, {
		message: 'Use letters, numbers, underscore or dot only',
	})
	@MinLength(3)
	@MaxLength(30)
	username?: string | null;

	@ApiPropertyOptional({
		example:
			'Skilled at turning ideas into impactful solutions by aligning user needs with business goals.',
	})
	@IsOptional()
	@TrimmedString()
	@IsString()
	@MaxLength(300)
	bio?: string | null;

	@ApiPropertyOptional({
		description: 'An id from GET /reference/categories.',
		example: 'talents',
	})
	@IsOptional()
	@IsString()
	@MaxLength(32)
	categoryId?: string;

	@ApiPropertyOptional({
		description: 'An id from GET /reference/occupations.',
		example: 'product-manager',
	})
	@IsOptional()
	@IsString()
	@MaxLength(32)
	occupationId?: string | null;

	@ApiPropertyOptional({ example: 'Ikeja, Lagos' })
	@IsOptional()
	@TrimmedString()
	@IsString()
	@MaxLength(120)
	locationLabel?: string | null;

	@ApiPropertyOptional({ example: 6.6018 })
	@IsOptional()
	@IsLatitude()
	latitude?: number | null;

	@ApiPropertyOptional({ example: 3.3515 })
	@IsOptional()
	@IsLongitude()
	longitude?: number | null;

	@ApiPropertyOptional({
		description:
			'The complete selection, not an addition. Ids come from GET /reference/hobbies.',
		example: ['music', 'art', 'travel'],
		type: [String],
		maxItems: 20,
	})
	@IsOptional()
	@IsArray()
	@ArrayUnique()
	@ArrayMaxSize(20)
	@IsString({ each: true })
	hobbyIds?: string[];
}
