import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Biometrics only. `pinEnabled` used to live here as a client-asserted flag;
 * it is now written by the server when a PIN hash is stored, so the flag and
 * the hash cannot disagree. Set a PIN through `PUT /users/me/pin`.
 */
export class UpdateSecurityDto {
	@ApiPropertyOptional({
		description: 'That biometric unlock was enrolled on the device.',
		example: true,
	})
	@IsOptional()
	@IsBoolean()
	biometricsEnabled?: boolean;
}
