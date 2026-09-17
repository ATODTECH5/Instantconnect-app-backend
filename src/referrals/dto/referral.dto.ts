import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PageInfoDto } from '../../common/dto/pagination.dto';
import type { User } from '../../users/entities/user.entity';
import type { Referral } from '../entities/referral.entity';

/**
 * How many joined friends fill the Invites progress bar. The design draws a
 * bar with no number on it; five is the point at which it reads as full.
 */
export const REFERRAL_GOAL = 5;

export enum ReferralStatus {
	/** Registered with the code, email not yet verified. */
	Pending = 'pending',
	Joined = 'joined',
}

/** One row of Referral History. */
export class ReferralDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ example: 'Tolu Adebayo' })
	fullName: string;

	@ApiPropertyOptional({ nullable: true })
	avatarUrl: string | null;

	@ApiProperty({ enum: ReferralStatus, enumName: 'ReferralStatus' })
	status: ReferralStatus;

	@ApiProperty({ format: 'date-time', description: 'When they registered.' })
	invitedAt: string;

	@ApiPropertyOptional({
		format: 'date-time',
		nullable: true,
		description: 'When they verified their email; null while pending.',
	})
	joinedAt: string | null;

	constructor(referral: Referral, referee: User, avatarUrl: string | null) {
		this.id = referral.id;
		this.fullName = referee.fullName;
		this.avatarUrl = avatarUrl;
		this.status = referee.emailVerifiedAt
			? ReferralStatus.Joined
			: ReferralStatus.Pending;
		this.invitedAt = referral.createdAt.toISOString();
		this.joinedAt = referee.emailVerifiedAt?.toISOString() ?? null;
	}
}

/** The Refer a Friend share screen in one read. */
export class ReferralsResponseDto {
	@ApiProperty({ example: 'HALIMA4001' })
	code: string;

	@ApiProperty({
		example: 3,
		description: 'Referrals whose email is verified, across every page.',
	})
	joinedCount: number;

	@ApiProperty({ example: 1 })
	pendingCount: number;

	@ApiProperty({ example: REFERRAL_GOAL })
	goal: number;

	@ApiProperty({ type: [ReferralDto] })
	items: ReferralDto[];

	@ApiProperty({ type: PageInfoDto })
	page: PageInfoDto;

	constructor(
		code: string,
		joinedCount: number,
		pendingCount: number,
		items: ReferralDto[],
		page: PageInfoDto,
	) {
		this.code = code;
		this.joinedCount = joinedCount;
		this.pendingCount = pendingCount;
		this.goal = REFERRAL_GOAL;
		this.items = items;
		this.page = page;
	}
}
