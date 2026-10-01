import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Post,
	Query,
} from '@nestjs/common';
import {
	ApiBadRequestResponse,
	ApiBearerAuth,
	ApiCookieAuth,
	ApiForbiddenResponse,
	ApiNoContentResponse,
	ApiOkResponse,
	ApiOperation,
	ApiTags,
	ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiErrorDto } from '../common/dto/api-error.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { ADMIN_SESSION_AUTH } from '../docs/swagger';
import { UserRole } from '../users/entities/user-role.enum';
import { AdminNotificationsService } from './admin-notifications.service';
import {
	AdminNotificationPageDto,
	MarkNotificationsReadDto,
} from './dto/admin-notification.dto';

@ApiTags('Admin Notifications')
@ApiCookieAuth(ADMIN_SESSION_AUTH)
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED', type: ApiErrorDto })
@ApiForbiddenResponse({ description: 'FORBIDDEN', type: ApiErrorDto })
@Roles(UserRole.Admin)
@Controller('admin/notifications')
export class AdminNotificationsController {
	constructor(private readonly notifications: AdminNotificationsService) {}

	@ApiOperation({
		summary: 'The bell: the last 30 days, newest first',
		description:
			'New KYC submissions, messages members sent to support, and new events. Read state is per admin.',
	})
	@ApiOkResponse({ type: AdminNotificationPageDto })
	@Get()
	list(
		@CurrentUser('id') adminId: string,
		@Query() query: PaginationQueryDto,
	): Promise<AdminNotificationPageDto> {
		return this.notifications.list(adminId, query);
	}

	@ApiOperation({ summary: 'Mark some as read' })
	@ApiNoContentResponse()
	@ApiBadRequestResponse({
		description: 'VALIDATION_FAILED',
		type: ApiErrorDto,
	})
	@HttpCode(HttpStatus.NO_CONTENT)
	@Post('read')
	markRead(
		@CurrentUser('id') adminId: string,
		@Body() dto: MarkNotificationsReadDto,
	): Promise<void> {
		return this.notifications.markRead(adminId, dto.ids);
	}

	@ApiOperation({ summary: 'Mark everything so far as read' })
	@ApiNoContentResponse()
	@HttpCode(HttpStatus.NO_CONTENT)
	@Post('read-all')
	markAllRead(@CurrentUser('id') adminId: string): Promise<void> {
		return this.notifications.markAllRead(adminId);
	}
}
