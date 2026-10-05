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
	ApiBadRequestResponse,
	ApiBearerAuth,
	ApiCreatedResponse,
	ApiForbiddenResponse,
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
import { UploadSignatureResponseDto } from '../common/dto/upload-signature.dto';
import { CommunitiesService } from './communities.service';
import { CommunityPostsService } from './community-posts.service';
import {
	CreateCommunityPostDto,
	CommunityPostDto,
	CommunityPostPageDto,
} from './dto/community-post.dto';
import {
	CommunityDetailDto,
	CommunityMemberDto,
	CommunityMemberPageDto,
	CommunityPageDto,
	CommunityUploadSignatureQueryDto,
	CreateCommunityDto,
	InvitableConnectionPageDto,
	InviteToCommunityDto,
	ListCommunitiesQueryDto,
	ListCommunityMembersQueryDto,
	ListInvitableQueryDto,
	UpdateCommunityDto,
	UpdateCommunityMemberDto,
} from './dto/community.dto';

const NOT_FOUND = { description: 'COMMUNITY_NOT_FOUND', type: ApiErrorDto };
const ADMIN_ONLY = {
	description: 'COMMUNITY_ADMIN_REQUIRED',
	type: ApiErrorDto,
};

@ApiTags('Communities')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED', type: ApiErrorDto })
@Controller('communities')
export class CommunitiesController {
	constructor(
		private readonly communities: CommunitiesService,
		private readonly posts: CommunityPostsService,
	) {}

	@ApiOperation({
		summary: 'Sign a direct upload for a community cover or a post photo',
		description:
			'Upload first, then send the storageId as coverStorageId or mediaStorageId.',
	})
	@ApiOkResponse({ type: UploadSignatureResponseDto })
	@Post('upload-signature')
	@HttpCode(HttpStatus.OK)
	uploadSignature(
		@CurrentUser('id') viewerId: string,
		@Query() query: CommunityUploadSignatureQueryDto,
	): UploadSignatureResponseDto {
		return new UploadSignatureResponseDto(
			this.communities.createUploadSignature(viewerId, query.kind),
		);
	}

	@ApiOperation({
		summary: 'Communities by scope',
		description:
			'joined: the Safety Community first, then the viewer’s communities. mine: created by the viewer. suggested: public ones the viewer is not in, biggest first. all: everything the viewer can see.',
	})
	@ApiOkResponse({ type: CommunityPageDto })
	@Get()
	list(
		@CurrentUser('id') viewerId: string,
		@Query() query: ListCommunitiesQueryDto,
	): Promise<CommunityPageDto> {
		return this.communities.list(viewerId, query);
	}

	@ApiOperation({
		summary: 'Create a community',
		description: 'The creator becomes its admin. Invitees are notified.',
	})
	@ApiCreatedResponse({ type: CommunityDetailDto })
	@ApiBadRequestResponse({
		description:
			'VALIDATION_FAILED, BLOCKED_CONTENT, CATEGORY_NOT_FOUND, UPLOAD_NOT_OWNED, UPLOAD_NOT_FOUND, INVITEE_NOT_CONNECTED',
		type: ApiErrorDto,
	})
	@Post()
	create(
		@CurrentUser('id') viewerId: string,
		@Body() dto: CreateCommunityDto,
	): Promise<CommunityDetailDto> {
		return this.communities.create(viewerId, dto);
	}

	@ApiOperation({ summary: 'One community' })
	@ApiOkResponse({ type: CommunityDetailDto })
	@ApiNotFoundResponse(NOT_FOUND)
	@Get(':id')
	findOne(
		@CurrentUser('id') viewerId: string,
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<CommunityDetailDto> {
		return this.communities.findOne(viewerId, id);
	}

	@ApiOperation({ summary: 'Edit a community (admins)' })
	@ApiOkResponse({ type: CommunityDetailDto })
	@ApiForbiddenResponse(ADMIN_ONLY)
	@Patch(':id')
	update(
		@CurrentUser('id') viewerId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: UpdateCommunityDto,
	): Promise<CommunityDetailDto> {
		return this.communities.update(viewerId, id, dto);
	}

	@ApiOperation({ summary: 'Delete a community (admins)' })
	@ApiNoContentResponse()
	@ApiForbiddenResponse(ADMIN_ONLY)
	@Delete(':id')
	@HttpCode(HttpStatus.NO_CONTENT)
	remove(
		@CurrentUser('id') viewerId: string,
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<void> {
		return this.communities.remove(viewerId, id);
	}

	@ApiOperation({
		summary: 'Join',
		description:
			'Idempotent. A private community needs an invitation, which this spends.',
	})
	@ApiOkResponse({ type: CommunityDetailDto })
	@ApiForbiddenResponse({
		description: 'COMMUNITY_INVITE_REQUIRED',
		type: ApiErrorDto,
	})
	@Post(':id/membership')
	@HttpCode(HttpStatus.OK)
	join(
		@CurrentUser('id') viewerId: string,
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<CommunityDetailDto> {
		return this.communities.join(viewerId, id);
	}

	@ApiOperation({
		summary: 'Leave',
		description:
			'Idempotent. Refused for the Safety Community. If the last admin leaves, the longest standing member becomes admin.',
	})
	@ApiNoContentResponse()
	@Delete(':id/membership')
	@HttpCode(HttpStatus.NO_CONTENT)
	leave(
		@CurrentUser('id') viewerId: string,
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<void> {
		return this.communities.leave(viewerId, id);
	}

	@ApiOperation({ summary: 'Members, admins first' })
	@ApiOkResponse({ type: CommunityMemberPageDto })
	@Get(':id/members')
	members(
		@CurrentUser('id') viewerId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Query() query: ListCommunityMembersQueryDto,
	): Promise<CommunityMemberPageDto> {
		return this.communities.listMembers(viewerId, id, query);
	}

	@ApiOperation({ summary: 'Make or unmake an admin (admins)' })
	@ApiOkResponse({ type: CommunityMemberDto })
	@ApiBadRequestResponse({
		description: 'COMMUNITY_LAST_ADMIN',
		type: ApiErrorDto,
	})
	@Patch(':id/members/:userId')
	setAdmin(
		@CurrentUser('id') viewerId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Param('userId', ParseUUIDPipe) userId: string,
		@Body() dto: UpdateCommunityMemberDto,
	): Promise<CommunityMemberDto> {
		return this.communities.setAdmin(viewerId, id, userId, dto.isAdmin);
	}

	@ApiOperation({ summary: 'Remove a member (admins)' })
	@ApiNoContentResponse()
	@Delete(':id/members/:userId')
	@HttpCode(HttpStatus.NO_CONTENT)
	removeMember(
		@CurrentUser('id') viewerId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Param('userId', ParseUUIDPipe) userId: string,
	): Promise<void> {
		return this.communities.removeMember(viewerId, id, userId);
	}

	@ApiOperation({
		summary: 'The viewer’s connections, marked member, invited or neither',
	})
	@ApiOkResponse({ type: InvitableConnectionPageDto })
	@Get(':id/invitable')
	invitable(
		@CurrentUser('id') viewerId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Query() query: ListInvitableQueryDto,
	): Promise<InvitableConnectionPageDto> {
		return this.communities.listInvitable(viewerId, id, query);
	}

	@ApiOperation({
		summary: 'Invite connections',
		description:
			'Admins always; members too in a public community. Members are skipped and an invitation is sent once.',
	})
	@ApiNoContentResponse()
	@ApiBadRequestResponse({
		description: 'INVITEE_NOT_CONNECTED',
		type: ApiErrorDto,
	})
	@Post(':id/invites')
	@HttpCode(HttpStatus.NO_CONTENT)
	invite(
		@CurrentUser('id') viewerId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: InviteToCommunityDto,
	): Promise<void> {
		return this.communities.invite(viewerId, id, dto.userIds);
	}

	@ApiOperation({ summary: 'The feed: pinned first, then newest' })
	@ApiOkResponse({ type: CommunityPostPageDto })
	@Get(':id/posts')
	listPosts(
		@CurrentUser('id') viewerId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Query() query: PaginationQueryDto,
	): Promise<CommunityPostPageDto> {
		return this.posts.list(viewerId, id, query);
	}

	@ApiOperation({ summary: 'Post to a community (members)' })
	@ApiCreatedResponse({ type: CommunityPostDto })
	@ApiForbiddenResponse({
		description: 'COMMUNITY_MEMBERSHIP_REQUIRED',
		type: ApiErrorDto,
	})
	@ApiBadRequestResponse({
		description:
			'VALIDATION_FAILED, BLOCKED_CONTENT, UPLOAD_NOT_OWNED, UPLOAD_NOT_FOUND',
		type: ApiErrorDto,
	})
	@Post(':id/posts')
	createPost(
		@CurrentUser('id') viewerId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: CreateCommunityPostDto,
	): Promise<CommunityPostDto> {
		return this.posts.create(viewerId, id, dto);
	}
}
