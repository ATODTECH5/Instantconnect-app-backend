import { ApiProperty } from '@nestjs/swagger';

import { PageInfoDto } from '../../common/dto/pagination.dto';
import { KycStatus } from '../../users/entities/kyc-status.enum';
import { UserStatus } from '../../users/entities/user-status.enum';
import { USER_PLANS, type UserPlan } from './admin-user-filters.dto';

export class AdminUserRowDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ example: 'Halima Lawal' })
	fullName: string;

	@ApiProperty({ format: 'email' })
	email: string;

	@ApiProperty({ nullable: true, type: String })
	avatarUrl: string | null;

	@ApiProperty({ enum: UserStatus, enumName: 'UserStatus' })
	status: UserStatus;

	@ApiProperty({ enum: KycStatus, enumName: 'KycStatus' })
	kycStatus: KycStatus;

	@ApiProperty({ enum: USER_PLANS })
	plan: UserPlan;

	@ApiProperty({ example: 24 })
	eventsAttended: number;

	@ApiProperty({ format: 'date-time' })
	joinedAt: string;
}

export class AdminUserPageDto {
	@ApiProperty({
		type: [AdminUserRowDto],
		description: 'Newest members first.',
	})
	items: AdminUserRowDto[];

	@ApiProperty({ type: PageInfoDto })
	page: PageInfoDto;

	constructor(items: AdminUserRowDto[], page: PageInfoDto) {
		this.items = items;
		this.page = page;
	}
}

export class AdminUserStatsDto {
	@ApiProperty({ example: 24 })
	eventsAttended: number;

	@ApiProperty({ example: 8 })
	eventsCreated: number;

	@ApiProperty({ description: 'Accepted connections.', example: 128 })
	connections: number;
}

export class AdminUserDetailDto extends AdminUserRowDto {
	@ApiProperty({ example: '+2348123456789' })
	phone: string;

	@ApiProperty({ nullable: true, type: String, example: 'halima' })
	username: string | null;

	@ApiProperty({
		nullable: true,
		type: String,
		format: 'date',
		example: '1997-03-13',
	})
	dateOfBirth: string | null;

	@ApiProperty({ nullable: true, type: String, example: 'Ikeja, Lagos' })
	location: string | null;

	@ApiProperty({ nullable: true, type: String, format: 'date-time' })
	lastActiveAt: string | null;

	@ApiProperty({ type: AdminUserStatsDto })
	stats: AdminUserStatsDto;
}
