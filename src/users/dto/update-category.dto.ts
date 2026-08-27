import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class UpdateCategoryDto {
	@ApiProperty({
		description:
			'An id from GET /reference/categories. An unknown id is rejected.',
		example: 'talents',
	})
	@IsString()
	@MaxLength(32)
	categoryId: string;
}
