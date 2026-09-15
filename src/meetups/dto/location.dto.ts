import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	IsBoolean,
	IsLatitude,
	IsLongitude,
	IsNumber,
	IsOptional,
	Min,
} from 'class-validator';

export class SetLocationSharingDto {
	@ApiProperty()
	@IsBoolean()
	enabled!: boolean;
}

export class ReportLocationDto {
	@ApiProperty({ example: 6.6018 })
	@IsLatitude()
	latitude!: number;

	@ApiProperty({ example: 3.3515 })
	@IsLongitude()
	longitude!: number;

	@ApiPropertyOptional({
		description:
			'Horizontal accuracy in metres, if the device reports one.',
	})
	@IsOptional()
	@IsNumber()
	@Min(0)
	accuracyM?: number;
}
