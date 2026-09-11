import {
	Controller,
	Get,
	Param,
	ParseUUIDPipe,
	Patch,
	Query,
} from '@nestjs/common';
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
import {
	NotificationPageDto,
	NotificationResponseDto,
} from './dto/notification-response.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED', type: ApiErrorDto })
@Controller('notifications')
export class NotificationsController {
	constructor(private readonly notifications: NotificationsService) {}

	@ApiOperation({
		summary: 'Notifications for the account, newest first',
		description:
			'unreadCount covers every notification, not just this page, so the bell is correct without paging.',
	})
	@ApiOkResponse({ type: NotificationPageDto })
	@Get()
	list(
		@CurrentUser('id') userId: string,
		@Query() query: PaginationQueryDto,
	): Promise<NotificationPageDto> {
		return this.notifications.list(userId, query);
	}

	@ApiOperation({ summary: 'Mark every notification read' })
	@ApiOkResponse({
		schema: { properties: { cleared: { type: 'number' } } },
	})
	@Patch('read')
	markAllRead(
		@CurrentUser('id') userId: string,
	): Promise<{ cleared: number }> {
		return this.notifications.markAllRead(userId);
	}

	@ApiOperation({ summary: 'Mark one notification read' })
	@ApiOkResponse({ type: NotificationResponseDto })
	@ApiNotFoundResponse({ description: 'NOT_FOUND', type: ApiErrorDto })
	@Patch(':id/read')
	markRead(
		@CurrentUser('id') userId: string,
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<NotificationResponseDto> {
		return this.notifications.markRead(userId, id);
	}
}
