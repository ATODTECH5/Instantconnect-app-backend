import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, Matches } from 'class-validator';

import { PageInfoDto } from '../../common/dto/pagination.dto';

export enum AdminNotificationKind {
	KycSubmitted = 'kyc_submitted',
	SupportMessage = 'support_message',
	EventCreated = 'event_created',
	UserReported = 'user_reported',
}

export const NOTIFICATION_ID_PATTERN =
	/^(kyc_submitted|support_message|event_created|user_reported):[0-9a-f-]{36}$/;

export class AdminNotificationDto {
	@ApiProperty({ example: 'kyc_submitted:3f1c…' })
	id!: string;

	@ApiProperty({ enum: AdminNotificationKind })
	kind!: AdminNotificationKind;

	@ApiProperty({
		description:
			'The KYC submission, the member who wrote to support, or the event.',
		format: 'uuid',
	})
	targetId!: string;

	@ApiProperty({ example: 'New KYC submission' })
	title!: string;

	@ApiProperty({ example: 'Halima Bello sent documents for review' })
	body!: string;

	@ApiProperty({ format: 'date-time' })
	occurredAt!: string;

	@ApiProperty()
	read!: boolean;
}

export class AdminNotificationPageDto {
	@ApiProperty({ type: [AdminNotificationDto] })
	items: AdminNotificationDto[];

	@ApiProperty({ description: 'Across the whole 30-day feed, not the page.' })
	unreadCount: number;

	@ApiProperty({ type: PageInfoDto })
	page: PageInfoDto;

	constructor(
		items: AdminNotificationDto[],
		unreadCount: number,
		page: PageInfoDto,
	) {
		this.items = items;
		this.unreadCount = unreadCount;
		this.page = page;
	}
}

export class MarkNotificationsReadDto {
	@ApiProperty({ type: [String], maxItems: 50 })
	@IsArray()
	@ArrayNotEmpty()
	@ArrayMaxSize(50)
	@Matches(NOTIFICATION_ID_PATTERN, {
		each: true,
		message: 'Unknown notification id',
	})
	ids!: string[];
}
