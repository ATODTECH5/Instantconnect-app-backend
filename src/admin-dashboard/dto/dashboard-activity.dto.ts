import { ApiProperty } from '@nestjs/swagger';

import { PageInfoDto } from '../../common/dto/pagination.dto';

export enum DashboardActivityKind {
	UserRegistered = 'user_registered',
	EventCreated = 'event_created',
	KycSubmitted = 'kyc_submitted',
}

export enum DashboardActivityStatus {
	Successful = 'successful',
	Completed = 'completed',
	Pending = 'pending',
	Approved = 'approved',
	Rejected = 'rejected',
}

export class DashboardActivityUserDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ example: 'Amina Yusuf' })
	fullName: string;

	@ApiProperty({ example: 'amina@example.com', format: 'email' })
	email: string;
}

export class DashboardActivityDto {
	@ApiProperty({
		description:
			'The row this entry is about: the user, event or submission.',
		format: 'uuid',
	})
	id: string;

	@ApiProperty({
		enum: DashboardActivityKind,
		enumName: 'DashboardActivityKind',
	})
	kind: DashboardActivityKind;

	@ApiProperty({ example: "Created new event 'Tech Summit Lagos'" })
	description: string;

	@ApiProperty({
		enum: DashboardActivityStatus,
		enumName: 'DashboardActivityStatus',
		description:
			'A KYC entry carries the submission’s current decision; the other kinds are always done.',
	})
	status: DashboardActivityStatus;

	@ApiProperty({ type: DashboardActivityUserDto })
	user: DashboardActivityUserDto;

	@ApiProperty({ format: 'date-time' })
	occurredAt: string;
}

export class DashboardActivityPageDto {
	@ApiProperty({ type: [DashboardActivityDto], description: 'Newest first.' })
	items: DashboardActivityDto[];

	@ApiProperty({ type: PageInfoDto })
	page: PageInfoDto;

	constructor(items: DashboardActivityDto[], page: PageInfoDto) {
		this.items = items;
		this.page = page;
	}
}
