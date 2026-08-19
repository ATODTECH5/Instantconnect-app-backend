import { ApiProperty } from '@nestjs/swagger';

import { InterestResponseDto } from '../../interests/dto/interest-response.dto';
import type { User } from '../entities/user.entity';
import { UserRole } from '../entities/user-role.enum';
import { UserStatus } from '../entities/user-status.enum';

/**
 * The only shape a user is ever allowed to leave the API in. Built field by
 * field on purpose: adding a column to the entity cannot leak it by accident.
 */
export class UserResponseDto {
	@ApiProperty({
		example: 'd30f0254-2b7d-404c-8035-73dda8fb4342',
		format: 'uuid',
	})
	id: string;

	@ApiProperty({ example: 'Ada Lovelace' })
	fullName: string;

	@ApiProperty({
		description:
			'Derived, for greeting the user without splitting the name client side.',
		example: 'Ada',
	})
	firstName: string;

	@ApiProperty({ example: 'ada@example.com', format: 'email' })
	email: string;

	@ApiProperty({
		description: 'Always stored in E.164, whichever form was submitted.',
		example: '+2348031234567',
	})
	phone: string;

	@ApiProperty({
		enum: UserRole,
		enumName: 'UserRole',
		example: UserRole.User,
	})
	role: UserRole;

	@ApiProperty({
		enum: UserStatus,
		enumName: 'UserStatus',
		example: UserStatus.Active,
	})
	status: UserStatus;

	@ApiProperty({ example: true })
	isEmailVerified: boolean;

	@ApiProperty({
		description:
			'Whether a PIN was set on the device. The PIN itself is never stored here.',
		example: false,
	})
	pinEnabled: boolean;

	@ApiProperty({ example: false })
	biometricsEnabled: boolean;

	@ApiProperty({ type: [InterestResponseDto] })
	interests: InterestResponseDto[];

	@ApiProperty({ example: '2026-08-19T07:12:03.114Z', format: 'date-time' })
	createdAt: string;

	constructor(user: User) {
		this.id = user.id;
		this.fullName = user.fullName;
		this.firstName = user.fullName.split(' ')[0];
		this.email = user.email;
		this.phone = user.phone;
		this.role = user.role;
		this.status = user.status;
		this.isEmailVerified = user.emailVerifiedAt !== null;
		this.pinEnabled = user.pinEnabled;
		this.biometricsEnabled = user.biometricsEnabled;
		this.interests = InterestResponseDto.fromMany(user.interests ?? []);
		this.createdAt = user.createdAt.toISOString();
	}
}
