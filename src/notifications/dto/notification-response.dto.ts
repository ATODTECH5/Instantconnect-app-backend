import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PageInfoDto } from '../../common/dto/pagination.dto';
import type { Notification } from '../entities/notification.entity';
import { NotificationKind } from '../entities/notification-kind.enum';

export class NotificationActorDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty()
	fullName: string;

	@ApiPropertyOptional({ nullable: true })
	avatarUrl: string | null;

	constructor(id: string, fullName: string, avatarUrl: string | null) {
		this.id = id;
		this.fullName = fullName;
		this.avatarUrl = avatarUrl;
	}
}

/**
 * Copy is written here rather than stored, so it always names the actor as
 * they are now. First name only, matching how the chat list refers to people.
 */
function describe(
	kind: NotificationKind,
	actorName: string | null,
): { title: string; body: string } {
	const who = actorName?.split(' ')[0] ?? 'Someone';

	switch (kind) {
		case NotificationKind.Message:
			return {
				title: 'New message',
				body: `${who} sent you a message`,
			};
		case NotificationKind.ConnectionRequest:
			return {
				title: 'Connection request',
				body: `${who} wants to connect with you`,
			};
		case NotificationKind.ConnectionAccepted:
			return {
				title: 'Connection accepted',
				body: `${who} accepted your connection request`,
			};
	}
}

export class NotificationResponseDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ enum: NotificationKind, enumName: 'NotificationKind' })
	kind: NotificationKind;

	@ApiProperty()
	title: string;

	@ApiProperty()
	body: string;

	@ApiPropertyOptional({ type: NotificationActorDto, nullable: true })
	actor: NotificationActorDto | null;

	@ApiPropertyOptional({
		nullable: true,
		format: 'uuid',
		description:
			'Conversation id for a message, connection id for the connection kinds.',
	})
	subjectId: string | null;

	@ApiProperty()
	isRead: boolean;

	@ApiProperty()
	createdAt: Date;

	constructor(notification: Notification, avatarUrl: string | null) {
		const actor = notification.actor;
		const copy = describe(notification.kind, actor?.fullName ?? null);

		this.id = notification.id;
		this.kind = notification.kind;
		this.title = copy.title;
		this.body = copy.body;
		this.actor = actor
			? new NotificationActorDto(actor.id, actor.fullName, avatarUrl)
			: null;
		this.subjectId = notification.subjectId;
		this.isRead = notification.readAt !== null;
		this.createdAt = notification.createdAt;
	}
}

export class NotificationPageDto {
	@ApiProperty({ type: [NotificationResponseDto] })
	items: NotificationResponseDto[];

	@ApiProperty({ type: PageInfoDto })
	page: PageInfoDto;

	@ApiProperty({
		description:
			'Across everything, not just this page, so the bell is right on page one.',
	})
	unreadCount: number;

	constructor(
		items: NotificationResponseDto[],
		page: PageInfoDto,
		unreadCount: number,
	) {
		this.items = items;
		this.page = page;
		this.unreadCount = unreadCount;
	}
}
