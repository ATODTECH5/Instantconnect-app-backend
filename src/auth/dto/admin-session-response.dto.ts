import { ApiProperty } from '@nestjs/swagger';

import { UserResponseDto } from '../../users/dto/user-response.dto';
import type { User } from '../../users/entities/user.entity';

/** The tokens themselves travel only as httpOnly cookies, never in the body. */
export class AdminSessionResponseDto {
	@ApiProperty({
		description:
			'Seconds until the access cookie expires, so the dashboard can refresh ahead of a 401.',
		example: 900,
	})
	accessTokenExpiresIn: number;

	@ApiProperty({ type: UserResponseDto })
	user: UserResponseDto;

	constructor(accessTokenExpiresIn: number, user: User) {
		this.accessTokenExpiresIn = accessTokenExpiresIn;
		this.user = new UserResponseDto(user);
	}
}

export class AdminRefreshResponseDto {
	@ApiProperty({ example: 900 })
	accessTokenExpiresIn: number;

	constructor(accessTokenExpiresIn: number) {
		this.accessTokenExpiresIn = accessTokenExpiresIn;
	}
}
