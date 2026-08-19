import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

import { IsEmailAddress } from '../../common/decorators/validation.decorators';

export class VerifyCodeDto {
	@ApiProperty({ example: 'ada@example.com', format: 'email' })
	@IsEmailAddress()
	email: string;

	@ApiProperty({
		description:
			'The 6 digits from the email. Issuing a new code retires the previous one.',
		example: '433200',
		pattern: '^\\d{6}$',
	})
	@IsString()
	@Matches(/^\d{6}$/, { message: 'Enter the 6 digit code' })
	code: string;
}
