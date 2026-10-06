import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	ArrayMaxSize,
	ArrayUnique,
	IsArray,
	IsBoolean,
	IsEnum,
	IsIn,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
} from 'class-validator';

import {
	PageInfoDto,
	PaginationQueryDto,
} from '../../common/dto/pagination.dto';
import { KycStatus } from '../../users/entities/kyc-status.enum';
import type { User } from '../../users/entities/user.entity';
import type { Community } from '../entities/community.entity';

const trim = Transform(({ value }: { value: unknown }) =>
	typeof value === 'string' ? value.trim() : value,
);

/** One notification each, raised inline, so the fan-out stays bounded. */
export const MAX_COMMUNITY_INVITES = 50;

/** Faces a card shows before the rest collapse into "+N". */
export const COMMUNITY_FACES = 3;

export class CommunityPersonDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ example: 'Halima Lawal' })
	fullName: string;

	@ApiPropertyOptional({ nullable: true, example: 'leemah' })
	username: string | null;

	@ApiPropertyOptional({ nullable: true })
	avatarUrl: string | null;

	@ApiProperty()
	isVerified: boolean;

	constructor(user: User, avatarUrl: string | null) {
		this.id = user.id;
		this.fullName = user.fullName;
		this.username = user.username ?? null;
		this.avatarUrl = avatarUrl;
		this.isVerified = user.kycStatus === KycStatus.Verified;
	}

	/**
	 * Platform admins post to the Safety Community as the team, so members
	 * never see which staff account wrote it. The id is the community's.
	 */
	static safetyTeam(communityId: string): CommunityPersonDto {
		return Object.assign(Object.create(CommunityPersonDto.prototype), {
			id: communityId,
			fullName: 'Safety Team',
			username: null,
			avatarUrl: null,
			isVerified: true,
		}) as CommunityPersonDto;
	}
}

export class CommunityCategoryDto {
	@ApiProperty({ example: 'social' })
	id: string;

	@ApiProperty({ example: 'Social' })
	label: string;

	constructor(id: string, label: string) {
		this.id = id;
		this.label = label;
	}
}

/** What the viewer can do here, so the app never has to work it out. */
export class CommunityViewerDto {
	@ApiProperty()
	isMember: boolean;

	@ApiProperty({ description: 'Can edit, invite, pin and remove.' })
	isAdmin: boolean;

	@ApiProperty({ description: 'Has an open invitation.' })
	isInvited: boolean;

	@ApiProperty({ description: 'False only for the Safety Community.' })
	canLeave: boolean;
}

export class CommunitySummaryDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ example: 'Fitness Enthusiasts' })
	name: string;

	@ApiPropertyOptional({ nullable: true })
	description: string | null;

	@ApiPropertyOptional({ type: CommunityCategoryDto, nullable: true })
	category: CommunityCategoryDto | null;

	@ApiPropertyOptional({ nullable: true })
	coverUrl: string | null;

	@ApiProperty()
	isPublic: boolean;

	@ApiProperty({ description: 'The Safety Community.' })
	isOfficial: boolean;

	@ApiProperty({ example: 14200 })
	memberCount: number;

	@ApiProperty({
		type: [CommunityPersonDto],
		description: `Up to ${COMMUNITY_FACES} members, for the card's faces.`,
	})
	memberPreview: CommunityPersonDto[];

	@ApiProperty({ description: 'The last post or comment.' })
	lastActivityAt: Date;

	@ApiProperty({ type: CommunityViewerDto })
	viewer: CommunityViewerDto;

	constructor(
		community: Community,
		extras: {
			coverUrl: string | null;
			memberCount: number;
			memberPreview: CommunityPersonDto[];
			viewer: CommunityViewerDto;
		},
	) {
		this.id = community.id;
		this.name = community.name;
		this.description = community.description;
		this.category = community.category
			? new CommunityCategoryDto(
					community.category.id,
					community.category.label,
				)
			: null;
		this.coverUrl = extras.coverUrl;
		this.isPublic = community.isPublic;
		this.isOfficial = community.isOfficial;
		this.memberCount = extras.memberCount;
		this.memberPreview = extras.memberPreview;
		this.lastActivityAt = community.lastActivityAt;
		this.viewer = extras.viewer;
	}
}

export class CommunityDetailDto extends CommunitySummaryDto {
	@ApiPropertyOptional({
		type: CommunityPersonDto,
		nullable: true,
		description: 'Null for the Safety Community.',
	})
	creator: CommunityPersonDto | null;

	@ApiProperty()
	createdAt: Date;

	constructor(
		community: Community,
		extras: ConstructorParameters<typeof CommunitySummaryDto>[1] & {
			creator: CommunityPersonDto | null;
		},
	) {
		super(community, extras);
		this.creator = extras.creator;
		this.createdAt = community.createdAt;
	}
}

export class CommunityPageDto {
	@ApiProperty({ type: [CommunitySummaryDto] })
	items: CommunitySummaryDto[];

	@ApiProperty({ type: PageInfoDto })
	page: PageInfoDto;

	constructor(items: CommunitySummaryDto[], page: PageInfoDto) {
		this.items = items;
		this.page = page;
	}
}

export enum CommunityScope {
	/** The Safety Community first, then every community the viewer is in. */
	Joined = 'joined',
	/** Communities the viewer created. */
	Mine = 'mine',
	/** Public communities the viewer is not in yet, biggest first. */
	Suggested = 'suggested',
	/** Every community the viewer can see. */
	All = 'all',
}

export class ListCommunitiesQueryDto extends PaginationQueryDto {
	@ApiPropertyOptional({
		enum: CommunityScope,
		enumName: 'CommunityScope',
		default: CommunityScope.Joined,
	})
	@IsOptional()
	@IsEnum(CommunityScope)
	scope: CommunityScope = CommunityScope.Joined;

	@ApiPropertyOptional({ maxLength: 60, description: 'Matches the name.' })
	@IsOptional()
	@trim
	@IsString()
	@MaxLength(60)
	search?: string;
}

export class CreateCommunityDto {
	@ApiProperty({ maxLength: 60, example: 'Downtown Chess Club' })
	@trim
	@IsString()
	@IsNotEmpty()
	@MaxLength(60)
	name!: string;

	@ApiPropertyOptional({ maxLength: 500 })
	@IsOptional()
	@trim
	@IsString()
	@MaxLength(500)
	description?: string;

	@ApiPropertyOptional({ example: 'social', description: 'A category id.' })
	@IsOptional()
	@IsString()
	@MaxLength(32)
	categoryId?: string;

	@ApiPropertyOptional({
		description:
			'From POST /communities/upload-signature with kind=cover, once uploaded.',
	})
	@IsOptional()
	@IsString()
	@MaxLength(255)
	coverStorageId?: string;

	@ApiProperty({ example: true })
	@IsBoolean()
	isPublic!: boolean;

	@ApiPropertyOptional({
		type: [String],
		maxItems: MAX_COMMUNITY_INVITES,
		description: 'Accepted connections to invite.',
	})
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(MAX_COMMUNITY_INVITES)
	@ArrayUnique()
	@IsUUID('4', { each: true })
	inviteeIds?: string[];
}

/** Absent keys are left alone; a null description or cover clears it. */
export class UpdateCommunityDto {
	@ApiPropertyOptional({ maxLength: 60 })
	@IsOptional()
	@trim
	@IsString()
	@IsNotEmpty()
	@MaxLength(60)
	name?: string;

	@ApiPropertyOptional({ maxLength: 500, nullable: true })
	@IsOptional()
	@trim
	@IsString()
	@MaxLength(500)
	description?: string | null;

	@ApiPropertyOptional({ nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(32)
	categoryId?: string | null;

	@ApiPropertyOptional({ nullable: true })
	@IsOptional()
	@IsString()
	@MaxLength(255)
	coverStorageId?: string | null;

	@ApiPropertyOptional()
	@IsOptional()
	@IsBoolean()
	isPublic?: boolean;
}

export class InviteToCommunityDto {
	@ApiProperty({ type: [String], maxItems: MAX_COMMUNITY_INVITES })
	@IsArray()
	@ArrayMaxSize(MAX_COMMUNITY_INVITES)
	@ArrayUnique()
	@IsUUID('4', { each: true })
	userIds!: string[];
}

export class CommunityUploadSignatureQueryDto {
	@ApiProperty({ enum: ['cover', 'post'] })
	@IsIn(['cover', 'post'])
	kind!: 'cover' | 'post';
}

export class CommunityMemberDto extends CommunityPersonDto {
	@ApiProperty()
	isAdmin: boolean;

	@ApiProperty()
	joinedAt: Date;

	constructor(
		user: User,
		avatarUrl: string | null,
		membership: { isAdmin: boolean; joinedAt: Date },
	) {
		super(user, avatarUrl);
		this.isAdmin = membership.isAdmin;
		this.joinedAt = membership.joinedAt;
	}
}

export class CommunityMemberPageDto {
	@ApiProperty({ type: [CommunityMemberDto] })
	items: CommunityMemberDto[];

	@ApiProperty({ type: PageInfoDto })
	page: PageInfoDto;

	constructor(items: CommunityMemberDto[], page: PageInfoDto) {
		this.items = items;
		this.page = page;
	}
}

export class ListCommunityMembersQueryDto extends PaginationQueryDto {
	@ApiPropertyOptional({ maxLength: 60, description: 'Name or username.' })
	@IsOptional()
	@trim
	@IsString()
	@MaxLength(60)
	search?: string;
}

export class UpdateCommunityMemberDto {
	@ApiProperty()
	@IsBoolean()
	isAdmin!: boolean;
}

export enum InvitableState {
	None = 'none',
	Invited = 'invited',
	Member = 'member',
}

export class InvitableConnectionDto extends CommunityPersonDto {
	@ApiProperty({ enum: InvitableState, enumName: 'InvitableState' })
	state: InvitableState;

	constructor(user: User, avatarUrl: string | null, state: InvitableState) {
		super(user, avatarUrl);
		this.state = state;
	}
}

export class InvitableConnectionPageDto {
	@ApiProperty({ type: [InvitableConnectionDto] })
	items: InvitableConnectionDto[];

	@ApiProperty({ type: PageInfoDto })
	page: PageInfoDto;

	constructor(items: InvitableConnectionDto[], page: PageInfoDto) {
		this.items = items;
		this.page = page;
	}
}

export class ListInvitableQueryDto extends PaginationQueryDto {
	@ApiPropertyOptional({ maxLength: 60 })
	@IsOptional()
	@trim
	@IsString()
	@MaxLength(60)
	search?: string;
}
