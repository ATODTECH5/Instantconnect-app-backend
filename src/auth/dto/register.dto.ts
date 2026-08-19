import { ApiProperty } from '@nestjs/swagger';
import {
	Equals,
	IsBoolean,
	IsString,
	Matches,
	MaxLength,
	MinLength,
} from 'class-validator';

import {
	IsEmailAddress,
	StrippedPhone,
	TrimmedString,
} from '../../common/decorators/validation.decorators';
import { IsStrongPassword } from './strong-password.decorator';

/** Local 0XXXXXXXXXX or international +234XXXXXXXXXX, matching the client's rule. */
const NIGERIAN_PHONE = /^(?:0|\+?234)(?:7[01]|8[01]|9[01])\d{8}$/;

export class RegisterDto {
	@ApiProperty({ example: 'Ada Lovelace', minLength: 2, maxLength: 80 })
	@IsString()
	@TrimmedString()
	@MinLength(2, { message: 'Enter your full name' })
	@MaxLength(80, { message: 'Name is too long' })
	@Matches(/^[\p{L}][\p{L}'\-. ]*$/u, {
		message: 'Use letters, spaces, hyphens and apostrophes only',
	})
	fullName: string;

	@ApiProperty({ example: 'ada@example.com', format: 'email' })
	@IsEmailAddress()
	email: string;

	@ApiProperty({
		description:
			'Nigerian mobile number, local or international. Both forms resolve to the same account.',
		example: '08031234567',
		examples: ['08031234567', '+2348031234567'],
	})
	@IsString()
	@StrippedPhone()
	@Matches(NIGERIAN_PHONE, { message: 'Enter a valid Nigerian phone number' })
	phone: string;

	@ApiProperty({
		description:
			'At least 8 characters, with a lowercase letter, an uppercase letter and a number.',
		example: 'Password1',
		minLength: 8,
		maxLength: 72,
	})
	@IsStrongPassword()
	password: string;

	@ApiProperty({
		description: 'Must be true. The request is rejected otherwise.',
		example: true,
	})
	@IsBoolean()
	@Equals(true, { message: 'Accept the terms to continue' })
	termsAccepted: boolean;
}
