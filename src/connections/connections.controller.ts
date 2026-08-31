import {
	Body,
	Controller,
	Get,
	Param,
	ParseUUIDPipe,
	Patch,
	Post,
	Query,
} from '@nestjs/common';
import {
	ApiBadRequestResponse,
	ApiBearerAuth,
	ApiConflictResponse,
	ApiCreatedResponse,
	ApiForbiddenResponse,
	ApiNotFoundResponse,
	ApiOkResponse,
	ApiOperation,
	ApiQuery,
	ApiTags,
	ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ApiErrorDto } from '../common/dto/api-error.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { ConnectionsService } from './connections.service';
import {
	ConnectionPageDto,
	ConnectionResponseDto,
} from './dto/connection-response.dto';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { RespondConnectionDto } from './dto/respond-connection.dto';
import { ConnectionStatus } from './entities/connection-status.enum';

@ApiTags('Connections')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED', type: ApiErrorDto })
@Controller('connections')
export class ConnectionsController {
	constructor(private readonly connections: ConnectionsService) {}

	@ApiOperation({ summary: 'Send a connection request' })
	@ApiCreatedResponse({ type: ConnectionResponseDto })
	@ApiBadRequestResponse({
		description: 'CANNOT_CONNECT_TO_SELF',
		type: ApiErrorDto,
	})
	@ApiNotFoundResponse({ description: 'USER_NOT_FOUND', type: ApiErrorDto })
	@ApiConflictResponse({
		description:
			'ALREADY_CONNECTED, REQUEST_ALREADY_SENT, REQUEST_ALREADY_RECEIVED or REQUEST_DECLINED',
		type: ApiErrorDto,
	})
	@Post()
	async request(
		@CurrentUser('id') userId: string,
		@Body() dto: CreateConnectionDto,
	): Promise<ConnectionResponseDto> {
		return this.connections.request(userId, dto.addresseeId);
	}

	@ApiOperation({
		summary: 'List the requests and connections the account is party to',
	})
	@ApiQuery({
		name: 'status',
		enum: ConnectionStatus,
		required: false,
		description: 'Omit to return every state.',
	})
	@ApiOkResponse({ type: ConnectionPageDto })
	@Get()
	async list(
		@CurrentUser('id') userId: string,
		@Query() pagination: PaginationQueryDto,
		@Query('status') status?: ConnectionStatus,
	): Promise<ConnectionPageDto> {
		return this.connections.list(userId, pagination, status);
	}

	@ApiOperation({ summary: 'Accept or decline a request you received' })
	@ApiOkResponse({ type: ConnectionResponseDto })
	@ApiForbiddenResponse({
		description: 'NOT_YOUR_REQUEST',
		type: ApiErrorDto,
	})
	@ApiNotFoundResponse({
		description: 'CONNECTION_NOT_FOUND',
		type: ApiErrorDto,
	})
	@ApiConflictResponse({
		description: 'REQUEST_ALREADY_ANSWERED',
		type: ApiErrorDto,
	})
	@Patch(':id')
	async respond(
		@CurrentUser('id') userId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: RespondConnectionDto,
	): Promise<ConnectionResponseDto> {
		return this.connections.respond(userId, id, dto.status);
	}
}
