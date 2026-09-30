import { Readable } from 'node:stream';

import {
	Controller,
	Get,
	Param,
	ParseUUIDPipe,
	Query,
	StreamableFile,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiCookieAuth,
	ApiForbiddenResponse,
	ApiNotFoundResponse,
	ApiOkResponse,
	ApiOperation,
	ApiProduces,
	ApiTags,
	ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { Roles } from '../common/decorators/roles.decorator';
import { ApiErrorDto } from '../common/dto/api-error.dto';
import { ADMIN_SESSION_AUTH } from '../docs/swagger';
import { UserRole } from '../users/entities/user-role.enum';
import { AdminEventsService, MAX_EXPORT_ROWS } from './admin-events.service';
import {
	AdminEventStatusFilterDto,
	ListAdminEventsQueryDto,
} from './dto/admin-event-filters.dto';
import {
	AdminEventDetailDto,
	AdminEventPageDto,
	AdminEventStatsDto,
} from './dto/admin-event.dto';

@ApiTags('Admin Events')
@ApiCookieAuth(ADMIN_SESSION_AUTH)
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED', type: ApiErrorDto })
@ApiForbiddenResponse({ description: 'FORBIDDEN', type: ApiErrorDto })
@Roles(UserRole.Admin)
@Controller('admin/events')
export class AdminEventsController {
	constructor(private readonly events: AdminEventsService) {}

	@ApiOperation({
		summary: 'Search and filter events',
		description:
			'Newest created first, public and invite only alike. Events from hosts who deleted their account are still listed.',
	})
	@ApiOkResponse({ type: AdminEventPageDto })
	@Get()
	list(@Query() query: ListAdminEventsQueryDto): Promise<AdminEventPageDto> {
		return this.events.list(query);
	}

	@ApiOperation({ summary: 'Totals for the stat cards' })
	@ApiOkResponse({ type: AdminEventStatsDto })
	@Get('stats')
	stats(): Promise<AdminEventStatsDto> {
		return this.events.stats();
	}

	@ApiOperation({
		summary: 'Download events as CSV',
		description: `Every event matching the filters, streamed in batches. Capped at ${MAX_EXPORT_ROWS} rows.`,
	})
	@ApiProduces('text/csv')
	@ApiOkResponse({ description: 'A CSV file.' })
	@Get('export')
	export(@Query() query: AdminEventStatusFilterDto): StreamableFile {
		const stamp = new Date().toISOString().slice(0, 10);

		return new StreamableFile(Readable.from(this.events.exportCsv(query)), {
			type: 'text/csv; charset=utf-8',
			disposition: `attachment; filename="instantconnect-events-${stamp}.csv"`,
		});
	}

	@ApiOperation({ summary: 'One event, with its venue and recent attendees' })
	@ApiOkResponse({ type: AdminEventDetailDto })
	@ApiNotFoundResponse({ description: 'EVENT_NOT_FOUND', type: ApiErrorDto })
	@Get(':id')
	findOne(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<AdminEventDetailDto> {
		return this.events.findOne(id);
	}
}
