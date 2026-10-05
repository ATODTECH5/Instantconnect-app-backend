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
	Put,
	Query,
} from '@nestjs/common';
import {
	ApiBadRequestResponse,
	ApiBearerAuth,
	ApiCreatedResponse,
	ApiNoContentResponse,
	ApiNotFoundResponse,
	ApiOkResponse,
	ApiOperation,
	ApiTags,
	ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiErrorDto } from '../common/dto/api-error.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { CommunityPostsService } from './community-posts.service';
import {
	CommunityCommentPageDto,
	CommunityPostDto,
	CommunityReplyDto,
	CreateCommunityCommentDto,
	ReportCommunityPostDto,
	UpdateCommunityPostDto,
} from './dto/community-post.dto';

const POST_NOT_FOUND = {
	description: 'COMMUNITY_POST_NOT_FOUND',
	type: ApiErrorDto,
};

/**
 * Actions on one post or comment. Likes, pins and mutes are PUT to set and
 * DELETE to clear, so repeating either is harmless.
 */
@ApiTags('Community Posts')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED', type: ApiErrorDto })
@Controller()
export class CommunityPostsController {
	constructor(private readonly posts: CommunityPostsService) {}

	@ApiOperation({ summary: 'One post' })
	@ApiOkResponse({ type: CommunityPostDto })
	@ApiNotFoundResponse(POST_NOT_FOUND)
	@Get('community-posts/:id')
	findOne(
		@CurrentUser('id') viewerId: string,
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<CommunityPostDto> {
		return this.posts.findOne(viewerId, id);
	}

	@ApiOperation({ summary: 'Edit a post (its author)' })
	@ApiOkResponse({ type: CommunityPostDto })
	@Patch('community-posts/:id')
	update(
		@CurrentUser('id') viewerId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: UpdateCommunityPostDto,
	): Promise<CommunityPostDto> {
		return this.posts.update(viewerId, id, dto.body);
	}

	@ApiOperation({ summary: 'Delete a post (its author or an admin)' })
	@ApiNoContentResponse()
	@Delete('community-posts/:id')
	@HttpCode(HttpStatus.NO_CONTENT)
	remove(
		@CurrentUser('id') viewerId: string,
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<void> {
		return this.posts.remove(viewerId, id);
	}

	@ApiOperation({ summary: 'Like a post' })
	@ApiOkResponse({ type: CommunityPostDto })
	@Put('community-posts/:id/like')
	like(
		@CurrentUser('id') viewerId: string,
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<CommunityPostDto> {
		return this.posts.setLiked(viewerId, id, true);
	}

	@ApiOperation({ summary: 'Unlike a post' })
	@ApiOkResponse({ type: CommunityPostDto })
	@Delete('community-posts/:id/like')
	unlike(
		@CurrentUser('id') viewerId: string,
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<CommunityPostDto> {
		return this.posts.setLiked(viewerId, id, false);
	}

	@ApiOperation({ summary: 'Pin a post (admins)' })
	@ApiOkResponse({ type: CommunityPostDto })
	@Put('community-posts/:id/pin')
	pin(
		@CurrentUser('id') viewerId: string,
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<CommunityPostDto> {
		return this.posts.setPinned(viewerId, id, true);
	}

	@ApiOperation({ summary: 'Unpin a post (admins)' })
	@ApiOkResponse({ type: CommunityPostDto })
	@Delete('community-posts/:id/pin')
	unpin(
		@CurrentUser('id') viewerId: string,
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<CommunityPostDto> {
		return this.posts.setPinned(viewerId, id, false);
	}

	@ApiOperation({
		summary: 'Mute a post',
		description: 'No comment or reply notifications from it.',
	})
	@ApiOkResponse({ type: CommunityPostDto })
	@Put('community-posts/:id/mute')
	mute(
		@CurrentUser('id') viewerId: string,
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<CommunityPostDto> {
		return this.posts.setMuted(viewerId, id, true);
	}

	@ApiOperation({ summary: 'Unmute a post' })
	@ApiOkResponse({ type: CommunityPostDto })
	@Delete('community-posts/:id/mute')
	unmute(
		@CurrentUser('id') viewerId: string,
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<CommunityPostDto> {
		return this.posts.setMuted(viewerId, id, false);
	}

	@ApiOperation({
		summary: 'Report a post',
		description: 'Anonymous to the author; one report per person per post.',
	})
	@ApiNoContentResponse()
	@ApiBadRequestResponse({
		description: 'COMMUNITY_REPORT_OWN_POST',
		type: ApiErrorDto,
	})
	@Post('community-posts/:id/reports')
	@HttpCode(HttpStatus.NO_CONTENT)
	report(
		@CurrentUser('id') viewerId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: ReportCommunityPostDto,
	): Promise<void> {
		return this.posts.report(viewerId, id, dto);
	}

	@ApiOperation({ summary: 'Comments, oldest first, with their replies' })
	@ApiOkResponse({ type: CommunityCommentPageDto })
	@Get('community-posts/:id/comments')
	comments(
		@CurrentUser('id') viewerId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Query() query: PaginationQueryDto,
	): Promise<CommunityCommentPageDto> {
		return this.posts.listComments(viewerId, id, query);
	}

	@ApiOperation({ summary: 'Comment, or reply with parentId (members)' })
	@ApiCreatedResponse({ type: CommunityReplyDto })
	@Post('community-posts/:id/comments')
	comment(
		@CurrentUser('id') viewerId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: CreateCommunityCommentDto,
	): Promise<CommunityReplyDto> {
		return this.posts.createComment(viewerId, id, dto);
	}

	@ApiOperation({ summary: 'Delete a comment (its author or an admin)' })
	@ApiNoContentResponse()
	@Delete('community-comments/:id')
	@HttpCode(HttpStatus.NO_CONTENT)
	removeComment(
		@CurrentUser('id') viewerId: string,
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<void> {
		return this.posts.removeComment(viewerId, id);
	}

	@ApiOperation({ summary: 'Like a comment' })
	@ApiNoContentResponse()
	@Put('community-comments/:id/like')
	@HttpCode(HttpStatus.NO_CONTENT)
	likeComment(
		@CurrentUser('id') viewerId: string,
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<void> {
		return this.posts.setCommentLiked(viewerId, id, true);
	}

	@ApiOperation({ summary: 'Unlike a comment' })
	@ApiNoContentResponse()
	@Delete('community-comments/:id/like')
	@HttpCode(HttpStatus.NO_CONTENT)
	unlikeComment(
		@CurrentUser('id') viewerId: string,
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<void> {
		return this.posts.setCommentLiked(viewerId, id, false);
	}
}
