import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PageInfoDto } from '../../common/dto/pagination.dto';
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

	@ApiProperty()
	createdAt: Date;

	constructor(message: Message, viewerId: string, mediaUrl: string | null) {
		this.id = message.id;
		this.kind = message.kind;
		this.body = message.body;
		this.mediaUrl = mediaUrl;
		this.isMine = message.senderId === viewerId;
		this.createdAt = message.createdAt;
	}
}

export class MessagePageDto {
	@ApiProperty({ type: [MessageResponseDto] })
	items: MessageResponseDto[];

	@ApiProperty({ type: PageInfoDto })
	page: PageInfoDto;

	constructor(items: MessageResponseDto[], page: PageInfoDto) {
		this.items = items;
		this.page = page;
	}
}
