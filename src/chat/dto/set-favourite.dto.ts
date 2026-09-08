import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetFavouriteDto {
	@ApiProperty({
		description:
			'Favouriting is per person: it does not change what the other party sees.',
	})
	@IsBoolean()
	isFavourite!: boolean;
}
