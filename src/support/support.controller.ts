import {
	Body,
	Controller,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
	Query,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiCreatedResponse,
	ApiForbiddenResponse,
	ApiNotFoundResponse,
	ApiOkResponse,
	ApiOperation,
	ApiTags,
	ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiErrorDto } from '../common/dto/api-error.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { UserRole } from '../users/entities/user-role.enum';
import {
	ReplySupportMessageDto,
	SendSupportMessageDto,
	SupportMessageDto,
	SupportMessagePageDto,
} from './dto/support-message.dto';
import { SupportService } from './support.service';

@ApiTags('Support')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED', type: ApiErrorDto })
@Controller('support')
export class SupportController {
	constructor(private readonly support: SupportService) {}

	@ApiOperation({
		summary: 'The viewer’s support thread, newest first',
		description:
			'Both directions. Outbound rows are replies from the team and carry an agent name and a subject.',
	})
	@ApiOkResponse({ type: SupportMessagePageDto })
	@Get('messages')
	list(
		@CurrentUser('id') userId: string,
		@Query() query: PaginationQueryDto,
	): Promise<SupportMessagePageDto> {
		return this.support.list(userId, query);
	}

	@ApiOperation({ summary: 'Send a message to support' })
	@ApiCreatedResponse({ type: SupportMessageDto })
	@Post('messages')
	send(
		@CurrentUser('id') userId: string,
		@Body() dto: SendSupportMessageDto,
	): Promise<SupportMessageDto> {
		return this.support.send(userId, dto.body);
	}

	@ApiOperation({
		summary: 'Reply to an account as the support team',
		description:
			'Admin only. Appears in that account’s Messages and Live Chat.',
	})
	@ApiCreatedResponse({ type: SupportMessageDto })
	@ApiForbiddenResponse({ description: 'FORBIDDEN', type: ApiErrorDto })
	@ApiNotFoundResponse({ description: 'USER_NOT_FOUND', type: ApiErrorDto })
	@Roles(UserRole.Admin)
	@Post('messages/:userId/reply')
	reply(
		@Param('userId', ParseUUIDPipe) userId: string,
		@Body() dto: ReplySupportMessageDto,
	): Promise<SupportMessageDto> {
		return this.support.reply(userId, dto.agentName, dto.subject, dto.body);
	}
}
