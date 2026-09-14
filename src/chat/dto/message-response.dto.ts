import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PageInfoDto } from '../../common/dto/pagination.dto';
import { MeetupResponseDto } from '../../meetups/dto/meetup-response.dto';
import type { Message } from '../entities/message.entity';
import { MessageKind } from '../entities/message-kind.enum';

export class MessageResponseDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ enum: MessageKind, enumName: 'MessageKind' })
	kind: MessageKind;

	@ApiPropertyOptional({ nullable: true })
	body: string | null;

	@ApiPropertyOptional({
		nullable: true,
		description: 'Resolved delivery URL.',
	})
	mediaUrl: string | null;

	@ApiProperty({
		description:
			'True when the viewer sent it, which decides the bubble side.',
	})
	isMine: boolean;

	@ApiPropertyOptional({
		type: MeetupResponseDto,
		nullable: true,
		description:
			'Present on meetup cards: the meetup as it is now, not as it was when the card was posted.',
	})
	meetup: MeetupResponseDto | null;

	@ApiProperty()
	createdAt: Date;

	constructor(
		message: Message,
		viewerId: string,
		mediaUrl: string | null,
		meetup: MeetupResponseDto | null = null,
	) {
		this.id = message.id;
		this.kind = message.kind;
		this.body = message.body;
		this.mediaUrl = mediaUrl;
		this.isMine = message.senderId === viewerId;
		this.meetup = meetup;
		this.createdAt = message.createdAt;
	}
}

export class MessagePageDto {
	@ApiProperty({ type: [MessageResponseDto] })
	items: MessageResponseDto[];

	@ApiProperty({ type: PageInfoDto })
	page: PageInfoDto;

	@ApiPropertyOptional({
		nullable: true,
		description:
			'How far the other party has read, so a sent tick can become a read tick.',
	})
	partyLastReadAt: Date | null;

	constructor(
		items: MessageResponseDto[],
		page: PageInfoDto,
		partyLastReadAt: Date | null,
	) {
		this.items = items;
		this.page = page;
		this.partyLastReadAt = partyLastReadAt;
	}
}
