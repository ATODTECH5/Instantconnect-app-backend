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
import { Mailer } from '../mail/mailer';
import { User } from '../users/entities/user.entity';
import { UserStatus } from '../users/entities/user-status.enum';
import { UsersService } from '../users/users.service';
import { authConfig } from '../config/configuration';
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
		private readonly jwt: JwtService,
		private readonly dataSource: DataSource,
		@Inject(authConfig.KEY)
		private readonly config: ConfigType<typeof authConfig>,
	) {}

	/**
	 * Registration cannot hide whether an address is taken without letting two
	 * people claim the same one, so it answers honestly here. Every other flow
	 * that takes an email stays silent about it.
	 */
	async register(dto: RegisterDto): Promise<RegistrationResponseDto> {
		const phone = toE164Nigerian(dto.phone);

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

		const user = await this.users.create({
			fullName: dto.fullName,
			email: dto.email,
			phone,
			passwordHash: await hashSecret(dto.password),
		});

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

		return this.startSession(
			await this.users.getByIdOrFail(user.id),
			context,
		);
	}

	/** Silent about unknown or already verified addresses, to stay unusable as an oracle. */
	async resendVerificationCode(dto: EmailDto): Promise<void> {
		const user = await this.users.findByEmail(dto.email);

		if (!user || user.emailVerifiedAt) return;

		await this.sendCode(user, VerificationPurpose.EmailVerification);
	}

	async signIn(
		dto: SignInDto,
		context: SessionContext,
	): Promise<SessionResponseDto> {
		const user = await this.users.findByEmailForAuthentication(dto.email);

		if (!user) {
			await burnVerification(dto.password);

			throw this.invalidCredentials();
		}

		if (!(await verifySecret(user.passwordHash, dto.password))) {
			throw this.invalidCredentials();
		}

		if (user.status === UserStatus.Suspended) {
			throw new ForbiddenException({
				code: 'ACCOUNT_SUSPENDED',
				message: 'This account has been suspended. Contact support.',
			});
		}

		if (!user.emailVerifiedAt) {
			throw new ForbiddenException({
				code: 'EMAIL_NOT_VERIFIED',
				message: 'Verify your email address to continue.',
			});
		}

		await this.users.recordSignIn(user.id);

		return this.startSession(
			await this.users.getByIdOrFail(user.id),
			context,
		);
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

	/**
	 * Consuming the grant, changing the secret and cutting existing sessions have
	 * to land together: a partial apply would either leave the grant replayable
	 * or leave a stolen session alive against the new password.
	 */
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

			await manager.update(User, payload.sub, { passwordHash });
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
