import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
	ApiBadRequestResponse,
	ApiBearerAuth,
	ApiCookieAuth,
	ApiForbiddenResponse,
	ApiOkResponse,
	ApiOperation,
	ApiTags,
	ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiErrorDto } from '../common/dto/api-error.dto';
import { ADMIN_SESSION_AUTH } from '../docs/swagger';
import { UserRole } from '../users/entities/user-role.enum';
import {
	PlatformSettingsDto,
	UpdatePlatformSettingsDto,
} from './dto/platform-settings.dto';
import { PlatformSettingsService } from './platform-settings.service';

@ApiTags('Admin Platform Settings')
@ApiCookieAuth(ADMIN_SESSION_AUTH)
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED', type: ApiErrorDto })
@ApiForbiddenResponse({ description: 'FORBIDDEN', type: ApiErrorDto })
@Roles(UserRole.Admin)
@Controller('admin/settings')
export class AdminPlatformSettingsController {
	constructor(private readonly settings: PlatformSettingsService) {}

	@ApiOperation({ summary: 'The settings the server enforces' })
	@ApiOkResponse({ type: PlatformSettingsDto })
	@Get()
	get(): Promise<PlatformSettingsDto> {
		return this.settings.describe();
	}

	@ApiOperation({
		summary: 'Change any of them',
		description:
			'Takes effect on this instance at once, elsewhere within 15 seconds.',
	})
	@ApiOkResponse({ type: PlatformSettingsDto })
	@ApiBadRequestResponse({
		description: 'VALIDATION_FAILED',
		type: ApiErrorDto,
	})
	@Patch()
	update(
		@CurrentUser('id') adminId: string,
		@Body() dto: UpdatePlatformSettingsDto,
	): Promise<PlatformSettingsDto> {
		return this.settings.update(adminId, dto);
	}
}
