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
	NearbyEventPageDto,
	NearbyEventsQueryDto,
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
		summary: 'Events the viewer is hosting, invited to, or going to',
		description:
			'role=host (default) is hosting only; role=any adds events the viewer was invited to or joined. Upcoming is soonest first and keeps an event until it ends; past and all are most recent first.',
	})
	@ApiOkResponse({ type: EventPageDto })
	@Get('mine')
	listMine(
		@CurrentUser('id') viewerId: string,
		@Query() query: ListMyEventsQueryDto,
	): Promise<EventPageDto> {
		return this.events.listMine(viewerId, query);
	}

	@ApiOperation({
		summary: 'Public events near the viewer',
		description:
			'Events that have not ended, within radiusKm of the viewer’s saved location, soonest first. Empty when the viewer has no location.',
	})
	@ApiOkResponse({ type: NearbyEventPageDto })
	@Get('nearby')
	listNearby(
		@CurrentUser('id') viewerId: string,
		@Query() query: NearbyEventsQueryDto,
	): Promise<NearbyEventPageDto> {
		return this.events.listNearby(viewerId, query);
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
		summary: 'Join a free event',
		description:
			'Idempotent. The host is notified the first time. Paid events are refused until checkout exists.',
	})
	@ApiOkResponse({ type: EventDetailDto })
	@ApiBadRequestResponse({
		description:
			'EVENT_HOST_CANNOT_JOIN, EVENT_ENDED, EVENT_TICKETS_UNAVAILABLE',
		type: ApiErrorDto,
	})
	@ApiNotFoundResponse({ description: 'EVENT_NOT_FOUND', type: ApiErrorDto })
	@Post(':id/attendance')
	@HttpCode(HttpStatus.OK)
	join(
		@CurrentUser('id') viewerId: string,
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<EventDetailDto> {
		return this.events.join(viewerId, id);
	}

	@ApiOperation({
		summary: 'Stop going to an event',
		description: 'Idempotent. Refused once the event has ended.',
	})
	@ApiOkResponse({ type: EventDetailDto })
	@ApiBadRequestResponse({ description: 'EVENT_ENDED', type: ApiErrorDto })
	@ApiNotFoundResponse({ description: 'EVENT_NOT_FOUND', type: ApiErrorDto })
	@Delete(':id/attendance')
	leave(
		@CurrentUser('id') viewerId: string,
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<EventDetailDto> {
		return this.events.leave(viewerId, id);
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
