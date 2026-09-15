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
} from '@nestjs/common';
import {
	ApiBadRequestResponse,
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
import { BlocksService } from './blocks.service';
import { BlockedUsersResponseDto, CreateBlockDto } from './dto/block.dto';

@ApiTags('Blocks')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED', type: ApiErrorDto })
@Controller('blocks')
export class BlocksController {
	constructor(private readonly blocks: BlocksService) {}

	@ApiOperation({ summary: 'List the accounts the viewer has blocked' })
	@ApiOkResponse({ type: BlockedUsersResponseDto })
	@Get()
	list(
		@CurrentUser('id') viewerId: string,
	): Promise<BlockedUsersResponseDto> {
		return this.blocks.list(viewerId);
	}

	@ApiOperation({
		summary: 'Block an account',
		description:
			'Hides each from the other in discovery, removes any connection between them and refuses new messages. Idempotent.',
	})
	@ApiNoContentResponse()
	@ApiBadRequestResponse({
		description: 'CANNOT_BLOCK_SELF',
		type: ApiErrorDto,
	})
	@ApiNotFoundResponse({ description: 'USER_NOT_FOUND', type: ApiErrorDto })
	@Post()
	@HttpCode(HttpStatus.NO_CONTENT)
	block(
		@CurrentUser('id') viewerId: string,
		@Body() dto: CreateBlockDto,
	): Promise<void> {
		return this.blocks.block(viewerId, dto.userId);
	}

	@ApiOperation({ summary: 'Unblock an account' })
	@ApiNoContentResponse()
	@ApiNotFoundResponse({ description: 'BLOCK_NOT_FOUND', type: ApiErrorDto })
	@Delete(':userId')
	@HttpCode(HttpStatus.NO_CONTENT)
	unblock(
		@CurrentUser('id') viewerId: string,
		@Param('userId', ParseUUIDPipe) userId: string,
	): Promise<void> {
		return this.blocks.unblock(viewerId, userId);
	}
}
