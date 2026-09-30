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
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiConflictResponse,
	ApiCookieAuth,
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
import { ADMIN_SESSION_AUTH } from '../docs/swagger';
import { UserRole } from '../users/entities/user-role.enum';
import { AdminMeetupsService } from './admin-meetups.service';
import {
	FlagMeetupDto,
	ListAdminMeetupsQueryDto,
} from './dto/admin-meetup-query.dto';
import {
	AdminMeetupDetailDto,
	AdminMeetupPageDto,
	AdminMeetupStatsDto,
} from './dto/admin-meetup.dto';

@ApiTags('Admin Live Connections')
@ApiCookieAuth(ADMIN_SESSION_AUTH)
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED', type: ApiErrorDto })
@ApiForbiddenResponse({ description: 'FORBIDDEN', type: ApiErrorDto })
@Roles(UserRole.Admin)
@Controller('admin/meetups')
export class AdminMeetupsController {
	constructor(private readonly meetups: AdminMeetupsService) {}

	@ApiOperation({
		summary: 'Ongoing or past meetups, with both people and the venue',
		description:
			'Ongoing is active, or scheduled with someone already on the way. Positions appear only while that person is sharing.',
	})
	@ApiOkResponse({ type: AdminMeetupPageDto })
	@Get()
	list(
		@Query() query: ListAdminMeetupsQueryDto,
	): Promise<AdminMeetupPageDto> {
		return this.meetups.list(query);
	}

	@ApiOperation({
		summary: 'Totals for the stat cards',
		description: '"Today" starts at midnight in Lagos.',
	})
	@ApiOkResponse({ type: AdminMeetupStatsDto })
	@Get('stats')
	stats(): Promise<AdminMeetupStatsDto> {
		return this.meetups.stats();
	}

	@ApiOperation({
		summary: 'One meetup, with its timeline and safety checks',
	})
	@ApiOkResponse({ type: AdminMeetupDetailDto })
	@ApiNotFoundResponse({ description: 'MEETUP_NOT_FOUND', type: ApiErrorDto })
	@Get(':id')
	findOne(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<AdminMeetupDetailDto> {
		return this.meetups.findOne(id);
	}

	@ApiOperation({
		summary: 'Flag a meetup, or change the reason',
		description: 'Neither person is told. The first flag time is kept.',
	})
	@ApiOkResponse({ type: AdminMeetupDetailDto })
	@ApiNotFoundResponse({ description: 'MEETUP_NOT_FOUND', type: ApiErrorDto })
	@HttpCode(HttpStatus.OK)
	@Post(':id/flag')
	flag(
		@CurrentUser('id') adminId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: FlagMeetupDto,
	): Promise<AdminMeetupDetailDto> {
		return this.meetups.flag(adminId, id, dto.reason);
	}

	@ApiOperation({ summary: 'Remove the flag' })
	@ApiOkResponse({ type: AdminMeetupDetailDto })
	@ApiNotFoundResponse({ description: 'MEETUP_NOT_FOUND', type: ApiErrorDto })
	@Delete(':id/flag')
	unflag(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<AdminMeetupDetailDto> {
		return this.meetups.unflag(id);
	}

	@ApiOperation({
		summary: 'Send both people a safety check',
		description:
			'An in-app notification that opens their chat. Only while the meetup is scheduled or active, and at most once a minute.',
	})
	@ApiOkResponse({ type: AdminMeetupDetailDto })
	@ApiNotFoundResponse({ description: 'MEETUP_NOT_FOUND', type: ApiErrorDto })
	@ApiConflictResponse({
		description: 'MEETUP_STATE_CONFLICT, SAFETY_CHECK_TOO_SOON',
		type: ApiErrorDto,
	})
	@HttpCode(HttpStatus.OK)
	@Post(':id/safety-check')
	safetyCheck(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<AdminMeetupDetailDto> {
		return this.meetups.sendSafetyCheck(id);
	}

	@ApiOperation({
		summary: 'Stop live location for both people',
		description:
			'Switches sharing off and clears their last positions. The meetup carries on, and either person can share again.',
	})
	@ApiOkResponse({ type: AdminMeetupDetailDto })
	@ApiNotFoundResponse({ description: 'NOT_FOUND', type: ApiErrorDto })
	@ApiConflictResponse({
		description: 'MEETUP_STATE_CONFLICT',
		type: ApiErrorDto,
	})
	@HttpCode(HttpStatus.OK)
	@Post(':id/stop-tracking')
	stopTracking(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<AdminMeetupDetailDto> {
		return this.meetups.stopTracking(id);
	}
}
