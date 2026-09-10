import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PageInfoDto } from '../../common/dto/pagination.dto';
import { KycStatus } from '../../users/entities/kyc-status.enum';
import type { User } from '../../users/entities/user.entity';
import type { Conversation } from '../entities/conversation.entity';
import type { Message } from '../entities/message.entity';
import { MessageKind } from '../entities/message-kind.enum';

export class ConversationPartyDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ example: 'Halima Lawal' })
	fullName: string;

	@ApiPropertyOptional({ nullable: true })
	avatarUrl: string | null;

	@ApiProperty({ example: false })
	isVerified: boolean;

	@ApiProperty({
		description: 'Derived from lastActiveAt, same rule as discovery.',
	})
	isOnline: boolean;

	constructor(user: User, avatarUrl: string | null, isOnline: boolean) {
		this.id = user.id;
		this.fullName = user.fullName;
		this.avatarUrl = avatarUrl;
		this.isVerified = user.kycStatus === KycStatus.Verified;
		this.isOnline = isOnline;
	}
}

/**
 * The last message as the chat list renders it: one line, whatever the kind.
 * An image has no body, so it is described rather than shown blank.
 */
export class ConversationPreviewDto {
	@ApiProperty({ example: 'Hello, how are you?' })
	text: string;

	@ApiProperty()
	isMine: boolean;

	@ApiProperty()
	createdAt: Date;

	constructor(message: Message, viewerId: string, senderFirstName: string) {
		this.isMine = message.senderId === viewerId;
		this.createdAt = message.createdAt;
		this.text =
			message.kind === MessageKind.Image
				? `${this.isMine ? 'You' : senderFirstName} sent a photo`
				: (message.body ?? '');
	}
}

export class ConversationResponseDto {
	@ApiProperty({
		format: 'uuid',
		description:
			'Also the id of the connection this thread belongs to. See the Chat migration.',
	})
	id: string;

	@ApiProperty({ type: ConversationPartyDto })
	party: ConversationPartyDto;

	@ApiPropertyOptional({ type: ConversationPreviewDto, nullable: true })
	lastMessage: ConversationPreviewDto | null;

	@ApiProperty({
		description:
			'Messages from the other party since the viewer last read.',
	})
	unreadCount: number;

	@ApiProperty()
	isFavourite: boolean;

	@ApiPropertyOptional({ nullable: true })
	lastMessageAt: Date | null;

	@ApiPropertyOptional({
		nullable: true,
		description:
			"How far the other party has read. A message of the viewer's sent at or before this has been seen by them.",
	})
	partyLastReadAt: Date | null;

	constructor(
		conversation: Conversation,
		party: ConversationPartyDto,
		lastMessage: ConversationPreviewDto | null,
		unreadCount: number,
		isFavourite: boolean,
		partyLastReadAt: Date | null,
	) {
		this.id = conversation.id;
		this.party = party;
		this.lastMessage = lastMessage;
		this.unreadCount = unreadCount;
		this.isFavourite = isFavourite;
		this.lastMessageAt = conversation.lastMessageAt;
		this.partyLastReadAt = partyLastReadAt;
	}
}

export class ConversationPageDto {
	@ApiProperty({ type: [ConversationResponseDto] })
	items: ConversationResponseDto[];

	@ApiProperty({ type: PageInfoDto })
	page: PageInfoDto;

	@ApiProperty({
		description:
			'Threads with at least one unread message. Backs the tab badge and the Unread chip count.',
	})
	unreadThreads: number;

	constructor(
		items: ConversationResponseDto[],
		page: PageInfoDto,
		unreadThreads: number,
	) {
		this.items = items;
		this.page = page;
		this.unreadThreads = unreadThreads;
	}
}
