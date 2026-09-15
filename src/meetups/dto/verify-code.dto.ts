import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export const ARRIVAL_CODE_LENGTH = 4;

export class VerifyCodeDto {
	@ApiProperty({
		example: '4917',
		description: "The other party's arrival code.",
	})
	@IsString()
	@Matches(/^\d{4}$/, { message: 'code must be exactly four digits' })
	code!: string;
}
