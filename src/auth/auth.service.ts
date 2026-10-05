import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Inject,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource, IsNull } from 'typeorm';

import {
	burnVerification,
	hashSecret,
	verifySecret,
} from '../common/utils/hashing.util';
import { toE164Nigerian } from '../common/utils/normalise.util';
import { ageOn } from '../common/utils/age.util';
import { Mailer } from '../mail/mailer';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { ReferralsService } from '../referrals/referrals.service';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/entities/user-role.enum';
import { UserStatus } from '../users/entities/user-status.enum';
import { UsersService } from '../users/users.service';
import { authConfig } from '../config/configuration';
import { AdminSignInDto } from './dto/admin-sign-in.dto';
import { EmailDto } from './dto/email.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import {
	IssuedTokens,
	RegistrationResponseDto,
	SessionResponseDto,
	TokenPairResponseDto,
} from './dto/session-response.dto';
import { SignInDto } from './dto/sign-in.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { RefreshToken } from './entities/refresh-token.entity';
import { VerificationCode } from './entities/verification-code.entity';
import { VerificationPurpose } from './entities/verification-purpose.enum';
import type { PasswordResetPayload, SessionContext } from './token-payload';
import { TokensService } from './tokens.service';
import { VerificationService } from './verification.service';

const firstNameOf = (fullName: string) => fullName.split(' ')[0];

@Injectable()
export class AuthService {
	constructor(
		private readonly users: UsersService,
		private readonly tokens: TokensService,
		private readonly verification: VerificationService,
		private readonly mailer: Mailer,
		private readonly referrals: ReferralsService,
		private readonly jwt: JwtService,
		private readonly dataSource: DataSource,
		private readonly platformSettings: PlatformSettingsService,
		@Inject(authConfig.KEY)
		private readonly config: ConfigType<typeof authConfig>,
	) {}

	async register(dto: RegisterDto): Promise<RegistrationResponseDto> {
		const phone = toE164Nigerian(dto.phone);
		const settings = await this.platformSettings.current();

		if (!settings.allowNewRegistrations) {
			throw new ForbiddenException({
				code: 'REGISTRATION_CLOSED',
				message:
					'Instant Connect is not accepting new accounts right now. Please try again later.',
			});
		}

		// The DTO already refuses anyone under the legal floor; this is the admin's higher bar.
		if (ageOn(dto.dateOfBirth) < settings.minimumAge) {
			throw new BadRequestException({
				code: 'UNDER_MINIMUM_AGE',
				message: `You must be at least ${settings.minimumAge} to use Instant Connect`,
			});
		}

		if (await this.users.findByEmail(dto.email)) {
			throw new ConflictException({
				code: 'EMAIL_TAKEN',
				message: 'An account with that email already exists.',
			});
		}

		if (await this.users.findByPhone(phone)) {
			throw new ConflictException({
				code: 'PHONE_TAKEN',
				message: 'An account with that phone number already exists.',
			});
		}

		// Checked before the account exists, so a mistyped code costs a retry
		// rather than an account with no referral behind it.
		const referrerId = dto.referralCode
			? await this.referrals.findReferrerIdByCode(dto.referralCode)
			: null;

		if (dto.referralCode && !referrerId) {
			throw new BadRequestException({
				code: 'INVALID_REFERRAL_CODE',
				message:
					'That referral code is not valid. Check it and try again.',
			});
		}

		const user = await this.users.create({
			fullName: dto.fullName,
			email: dto.email,
			phone,
			passwordHash: await hashSecret(dto.password),
			dateOfBirth: dto.dateOfBirth,
		});

		if (referrerId) await this.referrals.record(referrerId, user.id);

		await this.sendCode(user, VerificationPurpose.EmailVerification);

		return new RegistrationResponseDto(user.email);
	}

	async verifyEmail(
		dto: VerifyCodeDto,
		context: SessionContext,
	): Promise<SessionResponseDto> {
		const user = await this.users.findByEmail(dto.email);

		if (!user) {
			throw new BadRequestException({
				code: 'INVALID_CODE',
				message: 'That code is not correct. Check it and try again.',
			});
		}

		if (user.emailVerifiedAt) {
			throw new ConflictException({
				code: 'EMAIL_ALREADY_VERIFIED',
				message: 'That email is already verified. Please sign in.',
			});
		}

		const record = await this.verification.verify(
			user.id,
			VerificationPurpose.EmailVerification,
			dto.code,
		);

		await this.verification.consume(record.id);
		await this.users.markEmailVerified(user.id);
		await this.referrals.markJoined(user.id);

		// A disabled account still gets its email verified, just no session.
		if (user.status === UserStatus.Suspended) throw this.accountDisabled();

		return this.startSession(
			await this.users.getByIdOrFail(user.id),
			context,
		);
	}

	async resendVerificationCode(dto: EmailDto): Promise<void> {
		const user = await this.users.findByEmail(dto.email);

		if (!user || user.emailVerifiedAt) return;

		await this.sendCode(user, VerificationPurpose.EmailVerification);
	}

	async signIn(
		dto: SignInDto,
		context: SessionContext,
	): Promise<SessionResponseDto> {
		const user = await this.authenticate(dto);

		await this.users.recordSignIn(user.id);

		return this.startSession(
			await this.users.getByIdOrFail(user.id),
			context,
		);
	}

	/**
	 * An account without an admin role gets the same answer as a wrong password,
	 * so the dashboard cannot be used to find out which addresses are admins.
	 * Admin sessions never use the long lived refresh token.
	 */
	async signInAdmin(
		dto: AdminSignInDto,
		context: SessionContext,
	): Promise<{ tokens: IssuedTokens; user: User }> {
		const candidate = await this.authenticate(dto);

		if (candidate.role !== UserRole.Admin) throw this.invalidCredentials();

		await this.users.recordSignIn(candidate.id);

		const user = await this.users.getByIdOrFail(candidate.id);
		const tokens = await this.tokens.issueSession(user, {
			...context,
			keepSignedIn: false,
		});

		return { tokens, user };
	}

	rotateSession(
		refreshToken: string,
		context: SessionContext,
	): Promise<IssuedTokens> {
		return this.tokens.rotate(refreshToken, context);
	}

	private async authenticate(dto: AdminSignInDto): Promise<User> {
		const user = await this.users.findByEmailForAuthentication(dto.email);

		if (!user) {
			await burnVerification(dto.password);

			throw this.invalidCredentials();
		}

		const settings = await this.platformSettings.current();

		if (
			settings.lockoutEnabled &&
			user.lockedUntil &&
			user.lockedUntil > new Date()
		) {
			throw this.accountLocked(user.lockedUntil);
		}

		if (!(await verifySecret(user.passwordHash, dto.password))) {
			const lockedUntil = settings.lockoutEnabled
				? await this.users.recordFailedSignIn(
						user.id,
						settings.lockoutMaxAttempts,
						settings.lockoutMinutes,
					)
				: null;

			if (lockedUntil) throw this.accountLocked(lockedUntil);

			throw this.invalidCredentials();
		}

		if (user.status === UserStatus.Suspended) throw this.accountDisabled();

		if (!user.emailVerifiedAt) {
			throw new ForbiddenException({
				code: 'EMAIL_NOT_VERIFIED',
				message: 'Verify your email address to continue.',
			});
		}

		return user;
	}

	async refresh(
		refreshToken: string,
		context: SessionContext,
	): Promise<TokenPairResponseDto> {
		return new TokenPairResponseDto(
			await this.tokens.rotate(refreshToken, context),
		);
	}

	async signOut(refreshToken: string): Promise<void> {
		await this.tokens.revoke(refreshToken);
	}

	/** Always resolves, so the screen cannot be used to discover who has an account. */
	async requestPasswordReset(dto: EmailDto): Promise<void> {
		const user = await this.users.findByEmail(dto.email);

		if (!user || user.status === UserStatus.Suspended) return;

		await this.sendCode(user, VerificationPurpose.PasswordReset);
	}

	/**
	 * The code is checked but not spent here. It is consumed when the new
	 * password is actually set, which keeps the two step flow single use without
	 * a second table to track the grant.
	 */
	async verifyPasswordResetCode(dto: VerifyCodeDto): Promise<string> {
		const user = await this.users.findByEmail(dto.email);

		if (!user) {
			throw new BadRequestException({
				code: 'INVALID_CODE',
				message: 'That code is not correct. Check it and try again.',
			});
		}

		const record = await this.verification.verify(
			user.id,
			VerificationPurpose.PasswordReset,
			dto.code,
		);

		const payload: PasswordResetPayload = {
			sub: user.id,
			codeId: record.id,
		};

		return this.jwt.signAsync(payload, {
			secret: this.config.passwordResetSecret,
			expiresIn: this.config.passwordResetTtl,
		});
	}

	async resetPassword(dto: ResetPasswordDto): Promise<void> {
		const payload = await this.verifyResetGrant(dto.resetToken);
		const passwordHash = await hashSecret(dto.password);

		await this.dataSource.transaction(async (manager) => {
			const consumed = await manager.update(
				VerificationCode,
				{
					id: payload.codeId,
					userId: payload.sub,
					purpose: VerificationPurpose.PasswordReset,
					consumedAt: IsNull(),
				},
				{ consumedAt: new Date() },
			);

			if (!consumed.affected) throw this.invalidResetToken();

			// A new password is the way out of a lockout, so it lifts one.
			await manager.update(User, payload.sub, {
				passwordHash,
				failedSignInAttempts: 0,
				lockedUntil: null,
			});
			await manager.update(
				RefreshToken,
				{ userId: payload.sub, revokedAt: IsNull() },
				{ revokedAt: new Date() },
			);
		});
	}

	private async verifyResetGrant(
		resetToken: string,
	): Promise<PasswordResetPayload> {
		try {
			return await this.jwt.verifyAsync<PasswordResetPayload>(
				resetToken,
				{
					secret: this.config.passwordResetSecret,
				},
			);
		} catch {
			throw this.invalidResetToken();
		}
	}

	/**
	 * Told only after the right email was used, which reveals the account
	 * exists; that is the accepted price of telling people why they cannot
	 * get in and how to get out.
	 */
	private accountLocked(lockedUntil: Date): ForbiddenException {
		const minutes = Math.max(
			1,
			Math.ceil((lockedUntil.getTime() - Date.now()) / 60_000),
		);

		return new ForbiddenException({
			code: 'ACCOUNT_LOCKED',
			message: `Too many wrong passwords. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}, or reset your password.`,
		});
	}

	/** The code stays ACCOUNT_SUSPENDED: installed app builds already know it. */
	private accountDisabled(): ForbiddenException {
		return new ForbiddenException({
			code: 'ACCOUNT_SUSPENDED',
			message: 'This account has been disabled. Contact support.',
		});
	}

	private async startSession(
		user: User,
		context: SessionContext,
	): Promise<SessionResponseDto> {
		const tokens: IssuedTokens = await this.tokens.issueSession(
			user,
			context,
		);

		return new SessionResponseDto(tokens, user);
	}

	private async sendCode(
		user: User,
		purpose: VerificationPurpose,
	): Promise<void> {
		const code = await this.verification.issue(user.id, purpose);
		const firstName = firstNameOf(user.fullName);

		if (purpose === VerificationPurpose.EmailVerification) {
			await this.mailer.sendEmailVerificationCode(
				user.email,
				firstName,
				code,
			);
			return;
		}

		await this.mailer.sendPasswordResetCode(user.email, firstName, code);
	}

	private invalidCredentials(): UnauthorizedException {
		return new UnauthorizedException({
			code: 'INVALID_CREDENTIALS',
			message: 'That email and password do not match.',
		});
	}

	private invalidResetToken(): UnauthorizedException {
		return new UnauthorizedException({
			code: 'INVALID_RESET_TOKEN',
			message: 'That reset link has expired. Start again.',
		});
	}
}
