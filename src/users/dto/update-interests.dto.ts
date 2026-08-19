import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsString } from 'class-validator';

export class UpdateInterestsDto {
	@ApiProperty({
		description:
			'The complete selection, not an addition. Ids come from GET /interests; an unknown id rejects the whole request.',
		example: ['talent', 'business'],
		type: [String],
		maxItems: 20,
	})
	@IsArray()
	@ArrayUnique()
	@ArrayMaxSize(20)
	@IsString({ each: true })
	interestIds: string[];
}
