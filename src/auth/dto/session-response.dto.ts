import { ApiProperty } from '@nestjs/swagger';

import { UserResponseDto } from '../../users/dto/user-response.dto';
import type { User } from '../../users/entities/user.entity';

export type IssuedTokens = {
	accessToken: string;
	refreshToken: string;
	accessTokenExpiresIn: number;
	refreshTokenExpiresAt: Date;
};

const ACCESS_TOKEN = {
	description: 'Send as `Authorization: Bearer <token>`.',
	example:
		'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMzBmMDI1NCJ9.3sMwSQeilVhg',
};

const REFRESH_TOKEN = {
	description:
		'Opaque. Store only the newest; the previous one dies the moment this is issued.',
	example: 'fKdjPRt7mQ2vX9wLpZ3nB6cH1sA4eG8yT0uK5rN7iO2',
};

const EXPIRES_AT = { example: '2026-09-18T07:12:03.114Z', format: 'date-time' };

export class SessionResponseDto {
	@ApiProperty(ACCESS_TOKEN)
	accessToken: string;

	@ApiProperty(REFRESH_TOKEN)
	refreshToken: string;

	/** Seconds until the access token expires, so the client can refresh ahead of a 401. */
	@ApiProperty({ example: 900 })
	accessTokenExpiresIn: number;

	@ApiProperty(EXPIRES_AT)
	refreshTokenExpiresAt: string;

	@ApiProperty({ type: UserResponseDto })
	user: UserResponseDto;

	constructor(tokens: IssuedTokens, user: User) {
		this.accessToken = tokens.accessToken;
		this.refreshToken = tokens.refreshToken;
		this.accessTokenExpiresIn = tokens.accessTokenExpiresIn;
		this.refreshTokenExpiresAt = tokens.refreshTokenExpiresAt.toISOString();
		this.user = new UserResponseDto(user);
	}
}

export class TokenPairResponseDto {
	@ApiProperty(ACCESS_TOKEN)
	accessToken: string;

	@ApiProperty(REFRESH_TOKEN)
	refreshToken: string;

	@ApiProperty({ example: 900 })
	accessTokenExpiresIn: number;

	@ApiProperty(EXPIRES_AT)
	refreshTokenExpiresAt: string;

	constructor(tokens: IssuedTokens) {
		this.accessToken = tokens.accessToken;
		this.refreshToken = tokens.refreshToken;
		this.accessTokenExpiresIn = tokens.accessTokenExpiresIn;
		this.refreshTokenExpiresAt = tokens.refreshTokenExpiresAt.toISOString();
	}
}

export class ResetTokenResponseDto {
	@ApiProperty({
		description:
			'Proves the code step was cleared. Send it to /auth/reset-password within 10 minutes.',
		example:
			'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMzBmMDI1NCJ9.qT4H',
	})
	resetToken: string;

	constructor(resetToken: string) {
		this.resetToken = resetToken;
	}
}

export class RegistrationResponseDto {
	@ApiProperty({
		description:
			'Echoed back so the verification screen knows where the code was sent.',
		example: 'ada@example.com',
		format: 'email',
	})
	email: string;

	constructor(email: string) {
		this.email = email;
	}
}
