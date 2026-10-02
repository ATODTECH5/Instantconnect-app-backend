import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
	Patch,
	Put,
	Query,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiNoContentResponse,
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
import { RegisterPushTokenDto, RemovePushTokenDto } from './dto/push-token.dto';
import { NotificationsService } from './notifications.service';
import { PushService } from './push/push.service';

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED', type: ApiErrorDto })
@Controller('notifications')
export class NotificationsController {
	constructor(
		private readonly notifications: NotificationsService,
		private readonly push: PushService,
	) {}

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

	@ApiOperation({
		summary: 'Register this device for push',
		description:
			'Idempotent. A token already held by another account moves to this one, since it names the install rather than the person.',
	})
	@ApiNoContentResponse()
	@HttpCode(HttpStatus.NO_CONTENT)
	@Put('push-token')
	registerPushToken(
		@CurrentUser('id') userId: string,
		@Body() dto: RegisterPushTokenDto,
	): Promise<void> {
		return this.push.register(userId, dto.token, dto.platform);
	}

	@ApiOperation({
		summary: 'Stop pushing to this device',
		description:
			'Called on sign out. Answers 204 whether or not the token was registered.',
	})
	@ApiNoContentResponse()
	@HttpCode(HttpStatus.NO_CONTENT)
	@Delete('push-token')
	removePushToken(
		@CurrentUser('id') userId: string,
		@Body() dto: RemovePushTokenDto,
	): Promise<void> {
		return this.push.unregister(userId, dto.token);
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
