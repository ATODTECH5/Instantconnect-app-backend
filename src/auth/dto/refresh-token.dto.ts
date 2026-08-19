import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RefreshTokenDto {
	@ApiProperty({
		description:
			'The newest refresh token for the session. Sending a token that has already been exchanged revokes the whole family.',
		example: 'fKdjPRt7mQ2vX9wLpZ3nB6cH1sA4eG8yT0uK5rN7iO2',
	})
	@IsString()
	@MinLength(1)
	refreshToken: string;
}
