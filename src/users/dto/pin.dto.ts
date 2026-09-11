import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export const PIN_LENGTH = 4;

/** Kept as a string, never a number: `0142` must survive the round trip. */
const PIN_PATTERN = new RegExp(`^\\d{${PIN_LENGTH}}$`);

export class SetPinDto {
	@ApiProperty({
		description: `Exactly ${PIN_LENGTH} digits. Sequences and repeated digits are rejected.`,
		example: '4917',
		pattern: PIN_PATTERN.source,
	})
	@Matches(PIN_PATTERN, { message: `Enter a ${PIN_LENGTH} digit PIN` })
	pin!: string;
}

export class VerifyPinDto {
	@ApiProperty({ example: '4917', pattern: PIN_PATTERN.source })
	@Matches(PIN_PATTERN, { message: `Enter a ${PIN_LENGTH} digit PIN` })
	pin!: string;
}

export class PinVerificationResponseDto {
	@ApiProperty({
		description:
			'True only when the PIN matches. False also covers an account with no PIN set, so the two cannot be told apart.',
	})
	verified: boolean;

	constructor(verified: boolean) {
		this.verified = verified;
	}
}
