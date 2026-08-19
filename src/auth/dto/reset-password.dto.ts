import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

import { IsStrongPassword } from './strong-password.decorator';

export class ResetPasswordDto {
	@ApiProperty({
		description:
			'The grant returned by /auth/verify-reset-code. Valid for 10 minutes.',
		example:
			'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMzBmMDI1NCJ9.qT4H',
	})
	@IsString()
	@MinLength(1)
	resetToken: string;

	@ApiProperty({
		description:
			'At least 8 characters, with a lowercase letter, an uppercase letter and a number.',
		example: 'Password2',
		minLength: 8,
		maxLength: 72,
	})
	@IsStrongPassword()
	password: string;
}
