import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

import { NIGERIAN_PHONE } from '../../auth/dto/register.dto';
import {
	IsEmailAddress,
	StrippedPhone,
} from '../../common/decorators/validation.decorators';

export class ChangeEmailDto {
	@ApiProperty({
		description:
			'The address to move the account to. A code is sent there.',
		example: 'ada.new@example.com',
		format: 'email',
	})
	@IsEmailAddress()
	email: string;
}

export class ChangePhoneDto {
	@ApiProperty({
		description:
			'Nigerian mobile number, local or international. The code goes to the account email, since there is no SMS channel yet.',
		example: '08031234567',
	})
	@IsString()
	@StrippedPhone()
	@Matches(NIGERIAN_PHONE, { message: 'Enter a valid Nigerian phone number' })
	phone: string;
}

export class ConfirmCodeDto {
	@ApiProperty({
		description: 'The 4 digits from the email.',
		example: '4332',
		pattern: '^\\d{4}$',
	})
	@IsString()
	@Matches(/^\d{4}$/, { message: 'Enter the 4 digit code' })
	code: string;
}

export class CodeSentResponseDto {
	@ApiProperty({
		description:
			'Where the code went, masked, so the screen can say "sent to ada***@example.com".',
		example: 'ada***@example.com',
	})
	sentTo: string;

	constructor(sentTo: string) {
		this.sentTo = sentTo;
	}
}
