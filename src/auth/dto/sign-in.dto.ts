import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

import { IsEmailAddress } from '../../common/decorators/validation.decorators';

export class SignInDto {
	@ApiProperty({ example: 'ada@example.com', format: 'email' })
	@IsEmailAddress()
	email: string;

	/**
	 * Deliberately not checked against the sign up policy: an account made before
	 * a policy change must still be able to sign in.
	 */
	@ApiProperty({ example: 'Password1' })
	@IsString()
	@MinLength(1, { message: 'Enter your password' })
	password: string;

	@ApiPropertyOptional({
		description:
			'True keeps the session alive for 30 days. Omitted or false expires it after 1 day.',
		example: true,
		default: false,
	})
	@IsOptional()
	@IsBoolean()
	keepSignedIn?: boolean;
}
