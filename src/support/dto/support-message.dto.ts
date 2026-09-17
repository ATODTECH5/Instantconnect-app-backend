import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

import { PageInfoDto } from '../../common/dto/pagination.dto';
import { TrimmedString } from '../../common/decorators/validation.decorators';
import {
	SupportMessage,
	SupportMessageDirection,
} from '../entities/support-message.entity';

export const MAX_SUPPORT_MESSAGE_LENGTH = 2000;

export class SendSupportMessageDto {
	@ApiProperty({ minLength: 1, maxLength: MAX_SUPPORT_MESSAGE_LENGTH })
	@IsString()
	@TrimmedString()
	@MinLength(1, { message: 'Type a message first' })
	@MaxLength(MAX_SUPPORT_MESSAGE_LENGTH, {
		message: 'That message is too long',
	})
	body: string;
}

export class ReplySupportMessageDto extends SendSupportMessageDto {
	@ApiProperty({ example: 'Maya', maxLength: 80 })
	@IsString()
	@TrimmedString()
	@MinLength(1)
	@MaxLength(80)
	agentName: string;

	@ApiProperty({ example: 'Subscription Plan', maxLength: 120 })
	@IsString()
	@TrimmedString()
	@MinLength(1)
	@MaxLength(120)
	subject: string;
}

export class SupportMessageDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({
		enum: SupportMessageDirection,
		enumName: 'SupportMessageDirection',
	})
	direction: SupportMessageDirection;

	@ApiPropertyOptional({ nullable: true, example: 'Maya' })
	agentName: string | null;

	@ApiPropertyOptional({ nullable: true, example: 'Subscription Plan' })
	subject: string | null;

	@ApiProperty()
	body: string;

	@ApiProperty({ format: 'date-time' })
	createdAt: string;

	constructor(message: SupportMessage) {
		this.id = message.id;
		this.direction = message.direction;
		this.agentName = message.agentName;
		this.subject = message.subject;
		this.body = message.body;
		this.createdAt = message.createdAt.toISOString();
	}
}

export class SupportMessagePageDto {
	@ApiProperty({ type: [SupportMessageDto] })
	items: SupportMessageDto[];

	@ApiProperty({ type: PageInfoDto })
	page: PageInfoDto;

	constructor(items: SupportMessageDto[], page: PageInfoDto) {
		this.items = items;
		this.page = page;
	}
}
