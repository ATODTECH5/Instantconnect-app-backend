import { ApiProperty } from '@nestjs/swagger';

export class EventCategoryShareDto {
	@ApiProperty({
		description: 'Null for events created without a category.',
		example: 'business',
		nullable: true,
		type: String,
	})
	categoryId: string | null;

	@ApiProperty({ example: 'Business' })
	label: string;

	@ApiProperty({ example: 42 })
	count: number;

	@ApiProperty({
		description: 'Of all active events, one decimal.',
		example: 38.5,
	})
	percentage: number;
}

export class EventsByCategoryDto {
	@ApiProperty({
		description: 'Events that have not ended yet.',
		example: 109,
	})
	total: number;

	@ApiProperty({
		type: [EventCategoryShareDto],
		description: 'Largest first.',
	})
	categories: EventCategoryShareDto[];

	constructor(total: number, categories: EventCategoryShareDto[]) {
		this.total = total;
		this.categories = categories;
	}
}
