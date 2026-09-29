import { Readable } from 'node:stream';

import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
	Post,
	Query,
	StreamableFile,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiCookieAuth,
	ApiCreatedResponse,
	ApiForbiddenResponse,
	ApiNoContentResponse,
	ApiNotFoundResponse,
	ApiOkResponse,
	ApiOperation,
	ApiProduces,
	ApiTags,
	ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ADMIN_SESSION_AUTH } from '../docs/swagger';
import { ApiErrorDto } from '../common/dto/api-error.dto';
import { SupportMessageDto } from '../support/dto/support-message.dto';
import { UserRole } from '../users/entities/user-role.enum';
import { AdminUsersService, MAX_EXPORT_ROWS } from './admin-users.service';
import { AdminUserDetailDto, AdminUserPageDto } from './dto/admin-user.dto';
import {
	ExportAdminUsersQueryDto,
	ListAdminUsersQueryDto,
} from './dto/admin-user-filters.dto';
import { MessageAdminUserDto } from './dto/message-admin-user.dto';

@ApiTags('Admin Users')
@ApiCookieAuth(ADMIN_SESSION_AUTH)
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED', type: ApiErrorDto })
@ApiForbiddenResponse({ description: 'FORBIDDEN', type: ApiErrorDto })
@Roles(UserRole.Admin)
@Controller('admin/users')
export class AdminUsersController {
	constructor(private readonly users: AdminUsersService) {}

	@ApiOperation({
		summary: 'Search and filter members',
		description:
			'Newest first. Admins and deleted accounts are not listed.',
	})
	@ApiOkResponse({ type: AdminUserPageDto })
	@Get()
	list(@Query() query: ListAdminUsersQueryDto): Promise<AdminUserPageDto> {
		return this.users.list(query);
	}

	@ApiOperation({
		summary: 'Download members as CSV',
		description: `Every member matching the filters, or only \`ids\` when given, streamed in batches. Capped at ${MAX_EXPORT_ROWS} rows.`,
	})
	@ApiProduces('text/csv')
	@ApiOkResponse({ description: 'A CSV file.' })
	@Get('export')
	export(@Query() query: ExportAdminUsersQueryDto): StreamableFile {
		const stamp = new Date().toISOString().slice(0, 10);

		return new StreamableFile(Readable.from(this.users.exportCsv(query)), {
			type: 'text/csv; charset=utf-8',
			disposition: `attachment; filename="instantconnect-users-${stamp}.csv"`,
		});
	}

	@ApiOperation({ summary: 'One member, with activity counts' })
	@ApiOkResponse({ type: AdminUserDetailDto })
	@ApiNotFoundResponse({ description: 'USER_NOT_FOUND', type: ApiErrorDto })
	@Get(':id')
	findOne(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<AdminUserDetailDto> {
		return this.users.findOne(id);
	}

	@ApiOperation({
		summary: 'Message a member',
		description:
			'Lands in their Help & Support chat, signed with your first name. Only active accounts can be messaged.',
	})
	@ApiCreatedResponse({ type: SupportMessageDto })
	@ApiNotFoundResponse({ description: 'USER_NOT_FOUND', type: ApiErrorDto })
	@Post(':id/messages')
	message(
		@CurrentUser('id') adminId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: MessageAdminUserDto,
	): Promise<SupportMessageDto> {
		return this.users.message(adminId, id, dto);
	}

	@ApiOperation({
		summary: 'Disable a member',
		description:
			'They cannot sign in, and every session is revoked, so a signed in device is out within the access token lifetime. Stored as the `suspended` status.',
	})
	@ApiCreatedResponse({ type: AdminUserDetailDto })
	@ApiNotFoundResponse({ description: 'USER_NOT_FOUND', type: ApiErrorDto })
	@Post(':id/disable')
	disable(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<AdminUserDetailDto> {
		return this.users.disable(id);
	}

	@ApiOperation({
		summary: 'Re-enable a disabled member',
		description:
			'Active again, or pending if they never verified their email. They sign in afresh.',
	})
	@ApiCreatedResponse({ type: AdminUserDetailDto })
	@ApiNotFoundResponse({ description: 'USER_NOT_FOUND', type: ApiErrorDto })
	@Post(':id/enable')
	enable(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<AdminUserDetailDto> {
		return this.users.enable(id);
	}

	@ApiOperation({
		summary: 'Delete a member',
		description:
			'The same soft delete as deleting from Settings in the app. Their email and phone can register again.',
	})
	@ApiNoContentResponse()
	@ApiNotFoundResponse({ description: 'USER_NOT_FOUND', type: ApiErrorDto })
	@HttpCode(HttpStatus.NO_CONTENT)
	@Delete(':id')
	remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
		return this.users.remove(id);
	}
}
