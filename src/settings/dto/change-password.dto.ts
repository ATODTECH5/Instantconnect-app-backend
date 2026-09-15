import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

import { IsStrongPassword } from '../../auth/dto/strong-password.decorator';

export class ChangePasswordDto {
	@ApiProperty({ example: 'Password1' })
	@IsString()
	@MinLength(1, { message: 'Enter your current password' })
	currentPassword: string;

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
