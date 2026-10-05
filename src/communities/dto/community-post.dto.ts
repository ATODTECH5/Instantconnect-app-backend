import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
} from 'class-validator';

import { PageInfoDto } from '../../common/dto/pagination.dto';
import type { CommunityComment } from '../entities/community-comment.entity';
import type { CommunityPost } from '../entities/community-post.entity';
import { CommunityReportReason } from '../entities/community-report.entity';
import { CommunityPersonDto } from './community.dto';

const trim = Transform(({ value }: { value: unknown }) =>
	typeof value === 'string' ? value.trim() : value,
);

export class CreateCommunityPostDto {
	@ApiPropertyOptional({ maxLength: 2000 })
	@IsOptional()
	@trim
	@IsString()
	@MaxLength(2000)
	body?: string;

	@ApiPropertyOptional({
		description:
			'From POST /communities/upload-signature with kind=post, once uploaded.',
	})
	@IsOptional()
	@IsString()
	@MaxLength(255)
	mediaStorageId?: string;
}

export class UpdateCommunityPostDto {
	@ApiProperty({ maxLength: 2000 })
	@trim
	@IsString()
	@IsNotEmpty()
	@MaxLength(2000)
	body!: string;
}

export class CreateCommunityCommentDto {
	@ApiProperty({ maxLength: 1000 })
	@trim
	@IsString()
	@IsNotEmpty()
	@MaxLength(1000)
	body!: string;

	@ApiPropertyOptional({
		format: 'uuid',
		description:
			'Reply to this comment. A reply to a reply attaches to its parent.',
	})
	@IsOptional()
	@IsUUID('4')
	parentId?: string;
}

export class ReportCommunityPostDto {
	@ApiProperty({
		enum: CommunityReportReason,
		enumName: 'CommunityReportReason',
	})
	@IsEnum(CommunityReportReason)
	reason!: CommunityReportReason;

	@ApiPropertyOptional({ maxLength: 500 })
	@IsOptional()
	@trim
	@IsString()
	@MaxLength(500)
	details?: string;
}

/** What the viewer may do with a post, so the action sheet needs no rules. */
export class CommunityPostViewerDto {
	@ApiProperty()
	hasLiked: boolean;

	@ApiProperty()
	isMuted: boolean;

	@ApiProperty({ description: 'The author.' })
	canEdit: boolean;

	@ApiProperty({ description: 'The author or a community admin.' })
	canDelete: boolean;

	@ApiProperty({ description: 'A community admin.' })
	canPin: boolean;

	@ApiProperty({ description: 'Anyone but the author.' })
	canReport: boolean;
}

export class CommunityPostDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ format: 'uuid' })
	communityId: string;

	@ApiProperty({ type: CommunityPersonDto })
	author: CommunityPersonDto;

	@ApiProperty({
		description:
			'A community admin, or a platform admin in the Safety Community.',
	})
	authorIsAdmin: boolean;

	@ApiPropertyOptional({ nullable: true })
	body: string | null;

	@ApiPropertyOptional({ nullable: true })
	mediaUrl: string | null;

	@ApiProperty()
	isPinned: boolean;

	@ApiPropertyOptional({ nullable: true })
	editedAt: Date | null;

	@ApiProperty()
	likeCount: number;

	@ApiProperty()
	commentCount: number;

	@ApiProperty()
	createdAt: Date;

	@ApiProperty({ type: CommunityPostViewerDto })
	viewer: CommunityPostViewerDto;

	constructor(
		post: CommunityPost,
		extras: {
			author: CommunityPersonDto;
			authorIsAdmin: boolean;
			mediaUrl: string | null;
			viewer: CommunityPostViewerDto;
		},
	) {
		this.id = post.id;
		this.communityId = post.communityId;
		this.author = extras.author;
		this.authorIsAdmin = extras.authorIsAdmin;
		this.body = post.body;
		this.mediaUrl = extras.mediaUrl;
		this.isPinned = post.isPinned;
		this.editedAt = post.editedAt;
		this.likeCount = post.likeCount;
		this.commentCount = post.commentCount;
		this.createdAt = post.createdAt;
		this.viewer = extras.viewer;
	}
}

export class CommunityPostPageDto {
	@ApiProperty({ type: [CommunityPostDto] })
	items: CommunityPostDto[];

	@ApiProperty({ type: PageInfoDto })
	page: PageInfoDto;

	constructor(items: CommunityPostDto[], page: PageInfoDto) {
		this.items = items;
		this.page = page;
	}
}

export class CommunityReplyDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ type: CommunityPersonDto })
	author: CommunityPersonDto;

	@ApiProperty()
	authorIsAdmin: boolean;

	@ApiProperty()
	body: string;

	@ApiProperty()
	likeCount: number;

	@ApiProperty()
	hasLiked: boolean;

	@ApiProperty({ description: 'The author or a community admin.' })
	canDelete: boolean;

	@ApiProperty()
	createdAt: Date;

	constructor(
		comment: CommunityComment,
		extras: {
			author: CommunityPersonDto;
			authorIsAdmin: boolean;
			hasLiked: boolean;
			canDelete: boolean;
		},
	) {
		this.id = comment.id;
		this.author = extras.author;
		this.authorIsAdmin = extras.authorIsAdmin;
		this.body = comment.body;
		this.likeCount = comment.likeCount;
		this.hasLiked = extras.hasLiked;
		this.canDelete = extras.canDelete;
		this.createdAt = comment.createdAt;
	}
}

export class CommunityCommentDto extends CommunityReplyDto {
	@ApiProperty({
		type: [CommunityReplyDto],
		description: 'Oldest first.',
	})
	replies: CommunityReplyDto[];

	constructor(
		comment: CommunityComment,
		extras: ConstructorParameters<typeof CommunityReplyDto>[1],
		replies: CommunityReplyDto[],
	) {
		super(comment, extras);
		this.replies = replies;
	}
}

export class CommunityCommentPageDto {
	@ApiProperty({
		type: [CommunityCommentDto],
		description: 'Top level comments, oldest first, each with its replies.',
	})
	items: CommunityCommentDto[];

	@ApiProperty({ type: PageInfoDto })
	page: PageInfoDto;

	constructor(items: CommunityCommentDto[], page: PageInfoDto) {
		this.items = items;
		this.page = page;
	}
}
