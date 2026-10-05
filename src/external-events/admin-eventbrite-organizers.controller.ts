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
	Post,
	Query,
} from '@nestjs/common';
import {
	ApiAcceptedResponse,
	ApiBadRequestResponse,
	ApiBearerAuth,
	ApiConflictResponse,
	ApiCookieAuth,
	ApiCreatedResponse,
	ApiForbiddenResponse,
	ApiNoContentResponse,
	ApiNotFoundResponse,
	ApiOkResponse,
	ApiOperation,
	ApiServiceUnavailableResponse,
	ApiTags,
	ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiErrorDto } from '../common/dto/api-error.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { ADMIN_SESSION_AUTH } from '../docs/swagger';
import { UserRole } from '../users/entities/user-role.enum';
import {
	AddEventbriteOrganizerDto,
	EventbriteOrganizerDto,
	EventbriteOrganizerPageDto,
	UpdateEventbriteOrganizerDto,
} from './dto/eventbrite-organizer.dto';
import { EventbriteOrganizersService } from './eventbrite-organizers.service';

const NOT_CONFIGURED = {
	description: 'EVENTBRITE_NOT_CONFIGURED',
	type: ApiErrorDto,
};

@ApiTags('Admin Eventbrite Organizers')
@ApiCookieAuth(ADMIN_SESSION_AUTH)
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED', type: ApiErrorDto })
@ApiForbiddenResponse({ description: 'FORBIDDEN', type: ApiErrorDto })
@Roles(UserRole.Admin)
@Controller('admin/eventbrite-organizers')
export class AdminEventbriteOrganizersController {
	constructor(private readonly organizers: EventbriteOrganizersService) {}

	@ApiOperation({
		summary: 'Organizers whose public events are imported',
		description: 'Oldest added first.',
	})
	@ApiOkResponse({ type: EventbriteOrganizerPageDto })
	@Get()
	list(
		@Query() query: PaginationQueryDto,
	): Promise<EventbriteOrganizerPageDto> {
		return this.organizers.list(query);
	}

	@ApiOperation({
		summary: 'Add an organizer',
		description:
			'Checked against Eventbrite, then its events are imported in the background.',
	})
	@ApiCreatedResponse({ type: EventbriteOrganizerDto })
	@ApiBadRequestResponse({
		description:
			'VALIDATION_FAILED, INVALID_ORGANIZER, ORGANIZER_NOT_FOUND',
		type: ApiErrorDto,
	})
	@ApiConflictResponse({
		description: 'ORGANIZER_ALREADY_ADDED',
		type: ApiErrorDto,
	})
	@ApiServiceUnavailableResponse(NOT_CONFIGURED)
	@Post()
	add(
		@CurrentUser('id') adminId: string,
		@Body() dto: AddEventbriteOrganizerDto,
	): Promise<EventbriteOrganizerDto> {
		return this.organizers.add(adminId, dto.organizer);
	}

	@ApiOperation({
		summary: 'Import every organizer now',
		description:
			'Answers at once. Watch isSyncing on the list; a run already in progress is not doubled.',
	})
	@ApiAcceptedResponse({ description: 'Started.' })
	@ApiServiceUnavailableResponse(NOT_CONFIGURED)
	@Post('sync')
	@HttpCode(HttpStatus.ACCEPTED)
	sync(): void {
		this.organizers.syncAll();
	}

	@ApiOperation({ summary: 'Pause or resume importing an organizer' })
	@ApiOkResponse({ type: EventbriteOrganizerDto })
	@ApiNotFoundResponse({
		description: 'ORGANIZER_NOT_FOUND',
		type: ApiErrorDto,
	})
	@Patch(':id')
	update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: UpdateEventbriteOrganizerDto,
	): Promise<EventbriteOrganizerDto> {
		return this.organizers.setActive(id, dto.isActive);
	}

	@ApiOperation({
		summary: 'Remove an organizer',
		description:
			'Its upcoming events are deleted with it; past ones are kept.',
	})
	@ApiNoContentResponse()
	@ApiNotFoundResponse({
		description: 'ORGANIZER_NOT_FOUND',
		type: ApiErrorDto,
	})
	@Delete(':id')
	@HttpCode(HttpStatus.NO_CONTENT)
	remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
		return this.organizers.remove(id);
	}
}
