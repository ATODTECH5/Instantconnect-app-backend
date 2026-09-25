import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
	Post,
	Query,
} from '@nestjs/common';
import {
	ApiBadRequestResponse,
	ApiBearerAuth,
	ApiCreatedResponse,
	ApiNotFoundResponse,
	ApiOkResponse,
	ApiOperation,
	ApiServiceUnavailableResponse,
	ApiTags,
	ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiErrorDto } from '../common/dto/api-error.dto';
import { UploadSignatureResponseDto } from '../common/dto/upload-signature.dto';
import {
	CreateEventDto,
	EventDetailDto,
	EventPageDto,
	ListMyEventsQueryDto,
	RecentVenueDto,
} from './dto/event.dto';
import { EventsService } from './events.service';

@ApiTags('Events')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED', type: ApiErrorDto })
@Controller('events')
export class EventsController {
	constructor(private readonly events: EventsService) {}

	@ApiOperation({
		summary: 'Sign a direct upload for an event cover photo',
		description:
			'Upload before creating the event, then send the storageId as coverStorageId.',
	})
	@ApiOkResponse({ type: UploadSignatureResponseDto })
	@ApiServiceUnavailableResponse({
		description: 'STORAGE_NOT_CONFIGURED',
		type: ApiErrorDto,
	})
	@Post('cover-upload-signature')
	@HttpCode(HttpStatus.OK)
	coverUploadSignature(
		@CurrentUser('id') hostId: string,
	): UploadSignatureResponseDto {
		return new UploadSignatureResponseDto(
			this.events.createCoverUploadSignature(hostId),
		);
	}

	@ApiOperation({
		summary: 'Create an event and invite connections to it',
		description:
			'Each invitee is notified. Paid events store a price; there is no checkout yet.',
	})
	@ApiCreatedResponse({ type: EventDetailDto })
	@ApiBadRequestResponse({
		description:
			'VALIDATION_FAILED, EVENT_START_IN_PAST, EVENT_END_BEFORE_START, CATEGORY_NOT_FOUND, UPLOAD_NOT_OWNED, UPLOAD_NOT_FOUND, INVITEE_NOT_CONNECTED',
		type: ApiErrorDto,
	})
	@Post()
	create(
		@CurrentUser('id') hostId: string,
		@Body() dto: CreateEventDto,
	): Promise<EventDetailDto> {
		return this.events.create(hostId, dto);
	}

	@ApiOperation({
		summary: 'Events the viewer is hosting',
		description:
			'Upcoming is soonest first and keeps an event until it ends; past is most recent first.',
	})
	@ApiOkResponse({ type: EventPageDto })
	@Get('mine')
	listMine(
		@CurrentUser('id') hostId: string,
		@Query() query: ListMyEventsQueryDto,
	): Promise<EventPageDto> {
		return this.events.listMine(hostId, query);
	}

	@ApiOperation({
		summary: 'Distinct venues from the viewer’s recent events',
		description:
			'For the location picker. Most recent first, at most five.',
	})
	@ApiOkResponse({ type: [RecentVenueDto] })
	@Get('recent-venues')
	recentVenues(@CurrentUser('id') hostId: string): Promise<RecentVenueDto[]> {
		return this.events.recentVenues(hostId);
	}

	@ApiOperation({
		summary: 'One event',
		description:
			'A private event is visible only to its host and invitees. The invitee list is returned to the host only.',
	})
	@ApiOkResponse({ type: EventDetailDto })
	@ApiNotFoundResponse({ description: 'EVENT_NOT_FOUND', type: ApiErrorDto })
	@Get(':id')
	findOne(
		@CurrentUser('id') viewerId: string,
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<EventDetailDto> {
		return this.events.findOne(viewerId, id);
	}
}
