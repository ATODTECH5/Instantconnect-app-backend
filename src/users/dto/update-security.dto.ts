import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateSecurityDto {
	@ApiPropertyOptional({
		description:
			'That a PIN was set on the device. The PIN itself never leaves it.',
		example: true,
	})
	@IsOptional()
	@IsBoolean()
	pinEnabled?: boolean;

	@ApiPropertyOptional({
		description: 'That biometric unlock was enrolled on the device.',
		example: true,
	})
	@IsOptional()
	@IsBoolean()
	biometricsEnabled?: boolean;
}
