import {
	BadRequestException,
	ConflictException,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';

import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationCode } from '../auth/entities/verification-code.entity';
import { VerificationPurpose } from '../auth/entities/verification-purpose.enum';
import { VerificationService } from '../auth/verification.service';
import { hashSecret, verifySecret } from '../common/utils/hashing.util';
import { toE164Nigerian } from '../common/utils/normalise.util';
import { Mailer } from '../mail/mailer';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CodeSentResponseDto } from './dto/change-contact.dto';
import { RequestDeletionDto } from './dto/delete-account.dto';
import { UpdateNotificationPreferencesDto } from './dto/notification-preferences.dto';
import { NotificationPreference } from './entities/notification-preference.entity';

const firstNameOf = (fullName: string) => fullName.split(' ')[0];

/** "ada.lovelace@example.com" reads back as "ada***@example.com". */
export function maskEmail(email: string): string {
	const [local, domain] = email.split('@');

	return `${local.slice(0, 3)}***@${domain}`;
}

/** "+2348031234521" reads back as "+234 *** *** 4521". */
export function maskPhone(phone: string): string {
	return `${phone.slice(0, 4)} *** *** ${phone.slice(-4)}`;
}

@Injectable()
export class SettingsService {
	constructor(
		@InjectRepository(User)
		private readonly users: Repository<User>,
		@InjectRepository(NotificationPreference)
		private readonly preferences: Repository<NotificationPreference>,
		private readonly accounts: UsersService,
		private readonly verification: VerificationService,
		private readonly mailer: Mailer,
		private readonly dataSource: DataSource,
	) {}

	/**
	 * The code goes to the address being adopted, since the point is to prove
	 * the account holder can read it. The current address keeps working until
	 * the code is confirmed.
	 */
	async requestEmailChange(
		userId: string,
		email: string,
	): Promise<CodeSentResponseDto> {
		const user = await this.accounts.getByIdOrFail(userId);

		if (email === user.email) {
			throw new BadRequestException({
				code: 'SAME_EMAIL',
				message: 'That is already the email on your account.',
			});
		}

		if (await this.accounts.findByEmail(email)) {
			throw new ConflictException({
				code: 'EMAIL_TAKEN',
				message: 'That email is already in use on another account.',
			});
		}

		await this.users.update(userId, { pendingEmail: email });

		const code = await this.verification.issue(
			userId,
			VerificationPurpose.EmailChange,
		);
		await this.mailer.sendAccountCode(
			'email-change',
			email,
			firstNameOf(user.fullName),
			code,
		);

		return new CodeSentResponseDto(maskEmail(email));
	}

	async confirmEmailChange(userId: string, code: string): Promise<User> {
		const user = await this.accounts.getByIdOrFail(userId);

		if (!user.pendingEmail) throw this.nothingPending();

		const record = await this.verification.verify(
			userId,
			VerificationPurpose.EmailChange,
			code,
		);

		// Re-checked at confirmation: the address was free when the code was
		// requested, and ten minutes is long enough for that to have changed.
		if (await this.accounts.findByEmail(user.pendingEmail)) {
			throw new ConflictException({
				code: 'EMAIL_TAKEN',
				message: 'That email is already in use on another account.',
			});
		}

		await this.dataSource.transaction(async (manager) => {
			await manager.update(User, userId, {
				email: user.pendingEmail as string,
				emailVerifiedAt: new Date(),
				pendingEmail: null,
			});
			await manager.update(
				VerificationCode,
				{ id: record.id },
				{ consumedAt: new Date() },
			);
		});

		return this.accounts.getByIdOrFail(userId);
	}

	/**
	 * There is no SMS provider, so the proof of ownership a phone change ought
	 * to carry cannot be collected yet. The code goes to the account email
	 * instead, which at least proves the request came from the account holder.
	 */
	async requestPhoneChange(
		userId: string,
		phone: string,
	): Promise<CodeSentResponseDto> {
		const user = await this.accounts.getByIdOrFail(userId);
		const normalised = toE164Nigerian(phone);

		if (normalised === user.phone) {
			throw new BadRequestException({
				code: 'SAME_PHONE',
				message: 'That is already the phone number on your account.',
			});
		}

		if (await this.accounts.findByPhone(normalised)) {
			throw new ConflictException({
				code: 'PHONE_TAKEN',
				message:
					'That phone number is already in use on another account.',
			});
		}

		await this.users.update(userId, { pendingPhone: normalised });

		const code = await this.verification.issue(
			userId,
			VerificationPurpose.PhoneChange,
		);
		await this.mailer.sendAccountCode(
			'phone-change',
			user.email,
			firstNameOf(user.fullName),
			code,
		);

		return new CodeSentResponseDto(maskEmail(user.email));
	}

	async confirmPhoneChange(userId: string, code: string): Promise<User> {
		const user = await this.accounts.getByIdOrFail(userId);

		if (!user.pendingPhone) throw this.nothingPending();

		const record = await this.verification.verify(
			userId,
			VerificationPurpose.PhoneChange,
			code,
		);

		if (await this.accounts.findByPhone(user.pendingPhone)) {
			throw new ConflictException({
				code: 'PHONE_TAKEN',
				message:
					'That phone number is already in use on another account.',
			});
		}

		await this.users.update(userId, {
			phone: user.pendingPhone,
			pendingPhone: null,
		});
		await this.verification.consume(record.id);

		return this.accounts.getByIdOrFail(userId);
	}

	/**
	 * Every other session is signed out, as a password reset does. The one
	 * making the change keeps its access token until it expires and refreshes
	 * from the client's own stored refresh token, which is also revoked, so the
	 * app signs in again on its next refresh. That is the accepted cost.
	 */
	async changePassword(
		userId: string,
		dto: ChangePasswordDto,
	): Promise<void> {
		const user = await this.users.findOne({
			where: { id: userId },
			select: { id: true, passwordHash: true },
		});

		if (!user?.passwordHash) {
			throw new BadRequestException({
				code: 'NO_PASSWORD',
				message:
					'This account signs in with a provider and has no password to change.',
			});
		}

		if (!(await verifySecret(user.passwordHash, dto.currentPassword))) {
			throw new UnauthorizedException({
				code: 'INVALID_CREDENTIALS',
				message: 'That is not your current password.',
			});
		}

		if (dto.currentPassword === dto.password) {
			throw new BadRequestException({
				code: 'SAME_PASSWORD',
				message: 'Choose a password you have not used before.',
			});
		}

		const passwordHash = await hashSecret(dto.password);

		await this.dataSource.transaction(async (manager) => {
			await manager.update(User, userId, { passwordHash });
			await manager.update(
				RefreshToken,
				{ userId, revokedAt: IsNull() },
				{ revokedAt: new Date() },
			);
		});
	}

	async getNotificationPreferences(
		userId: string,
	): Promise<NotificationPreference> {
		const existing = await this.preferences.findOne({ where: { userId } });

		if (existing) return existing;

		return this.preferences.save(this.preferences.create({ userId }));
	}

	async updateNotificationPreferences(
		userId: string,
		changes: UpdateNotificationPreferencesDto,
	): Promise<NotificationPreference> {
		const current = await this.getNotificationPreferences(userId);

		return this.preferences.save(this.preferences.merge(current, changes));
	}

	async requestDeletion(
		userId: string,
		dto: RequestDeletionDto,
	): Promise<CodeSentResponseDto> {
		const user = await this.accounts.getByIdOrFail(userId);

		await this.users.update(userId, {
			deletionReason: dto.reason,
			deletionDetails: dto.details ?? null,
		});

		const code = await this.verification.issue(
			userId,
			VerificationPurpose.AccountDeletion,
		);
		await this.mailer.sendAccountCode(
			'account-deletion',
			user.email,
			firstNameOf(user.fullName),
			code,
		);

		return new CodeSentResponseDto(maskEmail(user.email));
	}

	/**
	 * Soft delete: `deletedAt` is what every unique index and every lookup
	 * keys on, so the row stops answering to sign in, discovery and chat at
	 * once, and the email and phone are free to register again. Every session
	 * is revoked in the same transaction, so a device that still holds a token
	 * is out at its next refresh.
	 */
	async confirmDeletion(userId: string, code: string): Promise<void> {
		const record = await this.verification.verify(
			userId,
			VerificationPurpose.AccountDeletion,
			code,
		);

		await this.dataSource.transaction(async (manager) => {
			await manager.update(
				RefreshToken,
				{ userId, revokedAt: IsNull() },
				{ revokedAt: new Date() },
			);
			await manager.softDelete(User, { id: userId });
		});

		await this.verification.consume(record.id);
	}

	private nothingPending(): BadRequestException {
		return new BadRequestException({
			code: 'NOTHING_PENDING',
			message: 'There is no change waiting for a code. Start again.',
		});
	}
}
