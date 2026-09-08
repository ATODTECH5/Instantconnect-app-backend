import {
	Body,
	Controller,
	Get,
	Param,
	Patch,
	Post,
	Query,
} from '@nestjs/common';
import { ParseUUIDPipe } from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiNotFoundResponse,
	ApiOkResponse,
	ApiOperation,
	ApiTags,
	ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiErrorDto } from '../common/dto/api-error.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { ChatService } from './chat.service';
import { ConversationPageDto } from './dto/conversation-response.dto';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';
import { MessagePageDto, MessageResponseDto } from './dto/message-response.dto';
import { ReadReceiptDto } from './dto/read-receipt.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { SetFavouriteDto } from './dto/set-favourite.dto';

@ApiTags('Chat')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED', type: ApiErrorDto })
@ApiNotFoundResponse({
	description: 'CONVERSATION_NOT_FOUND',
	type: ApiErrorDto,
})
@Controller('conversations')
export class ChatController {
	constructor(private readonly chat: ChatService) {}

	@ApiOperation({
		summary: 'Threads the account is party to, most recent first',
		description:
			'One per accepted connection, so a new connection appears here before either party has said anything.',
	})
	@ApiOkResponse({ type: ConversationPageDto })
	@Get()
	async list(
		@CurrentUser('id') userId: string,
		@Query() query: ListConversationsQueryDto,
	): Promise<ConversationPageDto> {
		return this.chat.listConversations(userId, query);
	}

	@ApiOperation({
		summary: 'One thread, newest message first',
		description:
			'The id is the connection id. Reading does not mark anything read; call read for that.',
	})
	@ApiOkResponse({ type: MessagePageDto })
	@Get(':id/messages')
	async messages(
		@CurrentUser('id') userId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Query() query: PaginationQueryDto,
	): Promise<MessagePageDto> {
		return this.chat.listMessages(userId, id, query);
	}

	@ApiOperation({ summary: 'Send a text message' })
	@ApiOkResponse({ type: MessageResponseDto })
	@Post(':id/messages')
	async send(
		@CurrentUser('id') userId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: SendMessageDto,
	): Promise<MessageResponseDto> {
		return this.chat.sendMessage(userId, id, dto.body);
	}

	@ApiOperation({ summary: 'Mark everything in the thread read' })
	@ApiOkResponse({ type: ReadReceiptDto })
	@Patch(':id/read')
	async read(
		@CurrentUser('id') userId: string,
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<ReadReceiptDto> {
		return this.chat.markRead(userId, id);
	}

	@ApiOperation({
		summary: 'Favourite or unfavourite a thread',
		description:
			'Per person: the other party is not told and does not see it.',
	})
	@Patch(':id/favourite')
	async favourite(
		@CurrentUser('id') userId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: SetFavouriteDto,
	): Promise<{ id: string; isFavourite: boolean }> {
		return this.chat.setFavourite(userId, id, dto.isFavourite);
	}
}
