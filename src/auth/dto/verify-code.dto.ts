import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

import { IsEmailAddress } from '../../common/decorators/validation.decorators';

export class VerifyCodeDto {
	@ApiProperty({ example: 'ada@example.com', format: 'email' })
	@IsEmailAddress()
	email: string;

	@ApiProperty({
		description:
			'The 4 digits from the email. Issuing a new code retires the previous one.',
		example: '4332',
		pattern: '^\\d{4}$',
	})
	@IsString()
	@Matches(/^\d{4}$/, { message: 'Enter the 4 digit code' })
	code: string;
}
