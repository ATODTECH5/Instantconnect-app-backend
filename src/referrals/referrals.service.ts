import { randomInt } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';

import { PageInfoDto } from '../common/dto/pagination.dto';
import type { PaginationQueryDto } from '../common/dto/pagination.dto';
import { NotificationKind } from '../notifications/entities/notification-kind.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { Storage } from '../storage/storage';
import { AVATAR_POSITION } from '../users/entities/user-photo.entity';
import { User } from '../users/entities/user.entity';
import { ReferralDto, ReferralsResponseDto } from './dto/referral.dto';
import { Referral } from './entities/referral.entity';

/** `HALIMA4001`: the first name, letters only, then four digits. */
const CODE_STEM_MAX = 8;
const CODE_FALLBACK_STEM = 'FRIEND';
const MINT_ATTEMPTS = 5;

@Injectable()
export class ReferralsService {
	constructor(
		@InjectRepository(Referral)
		private readonly referrals: Repository<Referral>,
		@InjectRepository(User)
		private readonly users: Repository<User>,
		private readonly storage: Storage,
		private readonly notifications: NotificationsService,
	) {}

	async overview(
		userId: string,
		query: PaginationQueryDto,
	): Promise<ReferralsResponseDto> {
		const code = await this.codeFor(userId);

		const [rows, total] = await this.referrals.findAndCount({
			where: { referrerId: userId },
			relations: { referee: { photos: true } },
			order: { createdAt: 'DESC' },
			take: query.limit,
			skip: query.offset,
		});

		const joinedCount = await this.referrals.count({
			where: {
				referrerId: userId,
				referee: { emailVerifiedAt: Not(IsNull()) },
			},
		});

		return new ReferralsResponseDto(
			code,
			joinedCount,
			total - joinedCount,
			rows.map((row) => this.toDto(row)),
			new PageInfoDto(total, query),
		);
	}

	/** One referral, for the "your friend joined" screen. Only the referrer may read it. */
	async get(userId: string, id: string): Promise<ReferralDto> {
		const row = await this.referrals.findOne({
			where: { id, referrerId: userId },
			relations: { referee: { photos: true } },
		});

		if (!row) {
			throw new NotFoundException({
				code: 'REFERRAL_NOT_FOUND',
				message: 'That referral does not exist.',
			});
		}

		return this.toDto(row);
	}

	/** Null when no account holds the code. Case and surrounding space are forgiven. */
	async findReferrerIdByCode(code: string): Promise<string | null> {
		const user = await this.users.findOne({
			where: { referralCode: normaliseCode(code) },
			select: { id: true },
		});

		return user?.id ?? null;
	}

	/** Called once, right after the referee's account row exists. */
	async record(referrerId: string, refereeId: string): Promise<void> {
		await this.referrals.insert({ referrerId, refereeId });
	}

	/**
	 * Called when the referee verifies their email. Verification happens once
	 * per account, so the referrer is told once. Nothing is put on the socket:
	 * the gateway lives in chat, and the bell catches up on its next read.
	 */
	async markJoined(refereeId: string): Promise<void> {
		const referral = await this.referrals.findOne({
			where: { refereeId },
			select: { id: true, referrerId: true },
		});

		if (!referral) return;

		await this.notifications.create({
			userId: referral.referrerId,
			kind: NotificationKind.ReferralJoined,
			actorId: refereeId,
			subjectId: referral.id,
		});
	}

	/**
	 * Minted on first read rather than at registration, so accounts that
	 * predate the feature get one the moment they open the screen. The
	 * conditional update means two concurrent first reads cannot both win, and
	 * a collision on the unique index simply tries another number.
	 */
	private async codeFor(userId: string): Promise<string> {
		const user = await this.users.findOne({
			where: { id: userId },
			select: { id: true, fullName: true, referralCode: true },
		});

		if (!user) {
			throw new NotFoundException({
				code: 'USER_NOT_FOUND',
				message: 'That account no longer exists.',
			});
		}

		if (user.referralCode) return user.referralCode;

		const stem =
			user.fullName
				.split(' ')[0]
				.replace(/[^A-Za-z]/g, '')
				.toUpperCase()
				.slice(0, CODE_STEM_MAX) || CODE_FALLBACK_STEM;

		for (let attempt = 0; attempt < MINT_ATTEMPTS; attempt += 1) {
			const candidate = `${stem}${randomInt(1000, 10000)}`;

			try {
				const result = await this.users.update(
					{ id: userId, referralCode: IsNull() },
					{ referralCode: candidate },
				);

				if (result.affected) return candidate;

				break;
			} catch {
				// Unique violation: someone else holds that number. Try another.
			}
		}

		const settled = await this.users.findOne({
			where: { id: userId },
			select: { referralCode: true },
		});

		if (settled?.referralCode) return settled.referralCode;

		throw new Error(`Could not mint a referral code for ${stem}`);
	}

	private toDto(row: Referral): ReferralDto {
		const avatar = row.referee.photos?.find(
			(photo) => photo.position === AVATAR_POSITION,
		);

		return new ReferralDto(
			row,
			row.referee,
			avatar
				? this.storage.buildUrl(avatar.storageId, 'thumbnail')
				: null,
		);
	}
}

export function normaliseCode(code: string): string {
	return code.trim().toUpperCase();
}
