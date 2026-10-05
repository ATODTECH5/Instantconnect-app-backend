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
	StreamableFile,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiCookieAuth,
	ApiCreatedResponse,
	ApiForbiddenResponse,
	ApiNoContentResponse,
	ApiNotFoundResponse,
	ApiOkResponse,
	ApiOperation,
	ApiProduces,
	ApiTags,
	ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiErrorDto } from '../common/dto/api-error.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import {
	CommunityPostDto,
	CommunityPostPageDto,
} from '../communities/dto/community-post.dto';
import { CommunityReportStatus } from '../communities/entities/community-report.entity';
import { CommunityPostsService } from '../communities/community-posts.service';
import { ADMIN_SESSION_AUTH } from '../docs/swagger';
import { UserRole } from '../users/entities/user-role.enum';
import {
	AdminCommunitiesService,
	MAX_EXPORT_ROWS,
} from './admin-communities.service';
import {
	AdminCommunityDetailDto,
	AdminCommunityFiltersDto,
	AdminCommunityPageDto,
	AdminCommunityStatsDto,
	CreateOfficialPostDto,
	ListAdminCommunitiesQueryDto,
	ListCommunityReportsQueryDto,
	ReportedPostPageDto,
} from './dto/admin-community.dto';

@ApiTags('Admin Communities')
@ApiCookieAuth(ADMIN_SESSION_AUTH)
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED', type: ApiErrorDto })
@ApiForbiddenResponse({ description: 'FORBIDDEN', type: ApiErrorDto })
@Roles(UserRole.Admin)
@Controller('admin/communities')
export class AdminCommunitiesController {
	constructor(
		private readonly communities: AdminCommunitiesService,
		private readonly posts: CommunityPostsService,
	) {}

	@ApiOperation({
		summary: 'Every community',
		description: 'The Safety Community first, then newest created.',
	})
	@ApiOkResponse({ type: AdminCommunityPageDto })
	@Get()
	list(
		@Query() query: ListAdminCommunitiesQueryDto,
	): Promise<AdminCommunityPageDto> {
		return this.communities.list(query);
	}

	@ApiOperation({
		summary: 'Download communities as CSV',
		description: `Every community matching the filters. Capped at ${MAX_EXPORT_ROWS} rows.`,
	})
	@ApiProduces('text/csv')
	@ApiOkResponse({ description: 'A CSV file.' })
	@Get('export')
	async export(
		@Query() filters: AdminCommunityFiltersDto,
	): Promise<StreamableFile> {
		const stamp = new Date().toISOString().slice(0, 10);

		return new StreamableFile(
			Buffer.from(await this.communities.exportCsv(filters)),
			{
				type: 'text/csv; charset=utf-8',
				disposition: `attachment; filename="instantconnect-communities-${stamp}.csv"`,
			},
		);
	}

	@ApiOperation({ summary: 'Totals for the stat cards' })
	@ApiOkResponse({ type: AdminCommunityStatsDto })
	@Get('stats')
	stats(): Promise<AdminCommunityStatsDto> {
		return this.communities.stats();
	}

	@ApiOperation({
		summary: 'Reported posts',
		description: 'Grouped by post, most reported first.',
	})
	@ApiOkResponse({ type: ReportedPostPageDto })
	@Get('reports')
	reports(
		@Query() query: ListCommunityReportsQueryDto,
	): Promise<ReportedPostPageDto> {
		return this.communities.reports(query);
	}

	@ApiOperation({ summary: 'Dismiss every open report on a post' })
	@ApiNoContentResponse()
	@ApiNotFoundResponse({
		description: 'COMMUNITY_REPORT_NOT_FOUND',
		type: ApiErrorDto,
	})
	@Post('reports/:postId/dismiss')
	@HttpCode(HttpStatus.NO_CONTENT)
	dismiss(
		@CurrentUser('id') adminId: string,
		@Param('postId', ParseUUIDPipe) postId: string,
	): Promise<void> {
		return this.communities.resolve(
			adminId,
			postId,
			CommunityReportStatus.Dismissed,
		);
	}

	@ApiOperation({
		summary: 'Remove a reported post',
		description:
			'Hides the post for everyone and settles its open reports.',
	})
	@ApiNoContentResponse()
	@Post('reports/:postId/remove')
	@HttpCode(HttpStatus.NO_CONTENT)
	removePost(
		@CurrentUser('id') adminId: string,
		@Param('postId', ParseUUIDPipe) postId: string,
	): Promise<void> {
		return this.communities.resolve(
			adminId,
			postId,
			CommunityReportStatus.Removed,
		);
	}

	@ApiOperation({ summary: 'Safety Community posts' })
	@ApiOkResponse({ type: CommunityPostPageDto })
	@Get('official/posts')
	officialPosts(
		@CurrentUser('id') adminId: string,
		@Query() query: PaginationQueryDto,
	): Promise<CommunityPostPageDto> {
		return this.communities.officialPosts(adminId, query);
	}

	@ApiOperation({
		summary: 'Post to the Safety Community',
		description: 'Shown with the admin badge, as the Safety Team.',
	})
	@ApiCreatedResponse({ type: CommunityPostDto })
	@Post('official/posts')
	postOfficially(
		@CurrentUser('id') adminId: string,
		@Body() dto: CreateOfficialPostDto,
	): Promise<CommunityPostDto> {
		return this.communities.postOfficially(adminId, dto.body);
	}

	@ApiOperation({ summary: 'Delete a Safety Community post' })
	@ApiNoContentResponse()
	@Delete('official/posts/:postId')
	@HttpCode(HttpStatus.NO_CONTENT)
	deleteOfficialPost(
		@CurrentUser('id') adminId: string,
		@Param('postId', ParseUUIDPipe) postId: string,
	): Promise<void> {
		return this.posts.remove(adminId, postId);
	}

	@ApiOperation({ summary: 'One community, for the details sheet' })
	@ApiOkResponse({ type: AdminCommunityDetailDto })
	@ApiNotFoundResponse({
		description: 'COMMUNITY_NOT_FOUND',
		type: ApiErrorDto,
	})
	@Get(':id')
	findOne(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<AdminCommunityDetailDto> {
		return this.communities.findOne(id);
	}

	@ApiOperation({
		summary: 'Delete a community',
		description:
			'Its posts and memberships go with it. Not the Safety Community.',
	})
	@ApiNoContentResponse()
	@Delete(':id')
	@HttpCode(HttpStatus.NO_CONTENT)
	remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
		return this.communities.remove(id);
	}
}
