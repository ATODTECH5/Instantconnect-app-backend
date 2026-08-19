import {
	ConflictException,
	ForbiddenException,
	UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { hashSecret, verifySecret } from '../common/utils/hashing.util';
import { Mailer } from '../mail/mailer';
import type { User } from '../users/entities/user.entity';
import { UserRole } from '../users/entities/user-role.enum';
import { UserStatus } from '../users/entities/user-status.enum';
import { UsersService } from '../users/users.service';
import { authConfig } from '../config/configuration';
import { AuthService } from './auth.service';
import { VerificationPurpose } from './entities/verification-purpose.enum';
import type { SessionContext } from './token-payload';
import { TokensService } from './tokens.service';
import { VerificationService } from './verification.service';

const CONTEXT: SessionContext = {
	keepSignedIn: false,
	userAgent: null,
	ipAddress: null,
};

const REGISTRATION = {
	fullName: 'Ada Lovelace',
	email: 'ada@example.com',
	phone: '08012345678',
	password: 'Password1',
	termsAccepted: true as const,
};

const hash = (plain: string): Promise<string> => hashSecret(plain);

const buildUser = (overrides: Partial<User> = {}): User =>
	({
		id: '11111111-1111-1111-1111-111111111111',
		fullName: 'Ada Lovelace',
		email: 'ada@example.com',
		phone: '+2348012345678',
		passwordHash: null,
		role: UserRole.User,
		status: UserStatus.Active,
		emailVerifiedAt: new Date(),
		pinEnabled: false,
		biometricsEnabled: false,
		interests: [],
		createdAt: new Date(),
		...overrides,
	}) as User;

describe('AuthService', () => {
	let service: AuthService;
	let users: Record<string, jest.Mock>;
	let tokens: Record<string, jest.Mock>;
	let verification: Record<string, jest.Mock>;
	let mailer: Record<string, jest.Mock>;
	let jwt: Record<string, jest.Mock>;

	beforeEach(async () => {
		users = {
			findByEmail: jest.fn().mockResolvedValue(null),
			findByPhone: jest.fn().mockResolvedValue(null),
			findByEmailForAuthentication: jest.fn().mockResolvedValue(null),
			create: jest
				.fn()
				.mockImplementation((data: { email: string }) =>
					Promise.resolve(buildUser({ email: data.email })),
				),
			getByIdOrFail: jest.fn().mockResolvedValue(buildUser()),
			markEmailVerified: jest.fn().mockResolvedValue(undefined),
			recordSignIn: jest.fn().mockResolvedValue(undefined),
		};

		tokens = {
			issueSession: jest.fn().mockResolvedValue({
				accessToken: 'access',
				refreshToken: 'refresh',
				accessTokenExpiresIn: 900,
				refreshTokenExpiresAt: new Date(),
			}),
			rotate: jest.fn(),
			revoke: jest.fn(),
		};

		verification = {
			issue: jest.fn().mockResolvedValue('123456'),
			verify: jest.fn().mockResolvedValue({ id: 'code-1' }),
			consume: jest.fn(),
		};

		mailer = {
			sendEmailVerificationCode: jest.fn().mockResolvedValue(undefined),
			sendPasswordResetCode: jest.fn().mockResolvedValue(undefined),
		};

		jwt = {
			signAsync: jest.fn().mockResolvedValue('reset.grant'),
			verifyAsync: jest.fn(),
		};

		const moduleRef = await Test.createTestingModule({
			providers: [
				AuthService,
				{ provide: UsersService, useValue: users },
				{ provide: TokensService, useValue: tokens },
				{ provide: VerificationService, useValue: verification },
				{ provide: Mailer, useValue: mailer },
				{ provide: JwtService, useValue: jwt },
				{ provide: DataSource, useValue: { transaction: jest.fn() } },
				{
					provide: authConfig.KEY,
					useValue: {
						passwordResetSecret: 'secret',
						passwordResetTtl: '10m',
					},
				},
			],
		}).compile();

		service = moduleRef.get(AuthService);
	});

	describe('register', () => {
		it('stores the phone in one canonical form regardless of the notation used', async () => {
			await service.register({ ...REGISTRATION, phone: '08012345678' });

			expect(users.create).toHaveBeenCalledWith(
				expect.objectContaining({ phone: '+2348012345678' }),
			);
		});

		it('treats the international form as the same number', async () => {
			await service.register({
				...REGISTRATION,
				phone: '+2348012345678',
			});

			expect(users.findByPhone).toHaveBeenCalledWith('+2348012345678');
		});

		it('never stores the password itself', async () => {
			await service.register(REGISTRATION);

			const calls = users.create.mock.calls as [
				{ passwordHash: string },
			][];
			const { passwordHash } = calls[0][0];

			expect(passwordHash).not.toContain(REGISTRATION.password);
			await expect(
				verifySecret(passwordHash, REGISTRATION.password),
			).resolves.toBe(true);
		});

		it('rejects an email that is already registered', async () => {
			users.findByEmail.mockResolvedValue(buildUser());

			await expect(service.register(REGISTRATION)).rejects.toThrow(
				ConflictException,
			);
		});

		it('rejects a phone number that is already registered', async () => {
			users.findByPhone.mockResolvedValue(buildUser());

			await expect(service.register(REGISTRATION)).rejects.toMatchObject({
				response: { code: 'PHONE_TAKEN' },
			});
		});

		it('emails a verification code', async () => {
			await service.register(REGISTRATION);

			expect(verification.issue).toHaveBeenCalledWith(
				expect.any(String),
				VerificationPurpose.EmailVerification,
			);
			expect(mailer.sendEmailVerificationCode).toHaveBeenCalledWith(
				'ada@example.com',
				'Ada',
				'123456',
			);
		});
	});

	describe('signIn', () => {
		const credentials = {
			email: 'ada@example.com',
			password: 'Password1',
			keepSignedIn: false,
		};

		it('gives the same answer for an unknown account as for a wrong password', async () => {
			users.findByEmailForAuthentication.mockResolvedValue(null);

			await expect(
				service.signIn(credentials, CONTEXT),
			).rejects.toMatchObject({
				response: { code: 'INVALID_CREDENTIALS' },
			});
		});

		it('rejects a wrong password', async () => {
			users.findByEmailForAuthentication.mockResolvedValue(
				buildUser({ passwordHash: await hash('Different1') }),
			);

			await expect(service.signIn(credentials, CONTEXT)).rejects.toThrow(
				UnauthorizedException,
			);
		});

		it('refuses a suspended account', async () => {
			users.findByEmailForAuthentication.mockResolvedValue(
				buildUser({
					passwordHash: await hash(credentials.password),
					status: UserStatus.Suspended,
				}),
			);

			await expect(
				service.signIn(credentials, CONTEXT),
			).rejects.toMatchObject({
				response: { code: 'ACCOUNT_SUSPENDED' },
			});
		});

		it('refuses an unverified account and says why, so the app can resume onboarding', async () => {
			users.findByEmailForAuthentication.mockResolvedValue(
				buildUser({
					passwordHash: await hash(credentials.password),
					emailVerifiedAt: null,
				}),
			);

			await expect(
				service.signIn(credentials, CONTEXT),
			).rejects.toMatchObject({
				response: { code: 'EMAIL_NOT_VERIFIED' },
			});
		});

		it('issues a session and records the sign in on success', async () => {
			users.findByEmailForAuthentication.mockResolvedValue(
				buildUser({ passwordHash: await hash(credentials.password) }),
			);

			const session = await service.signIn(credentials, CONTEXT);

			expect(session.accessToken).toBe('access');
			expect(users.recordSignIn).toHaveBeenCalled();
		});

		it('does not leak the password hash into the response', async () => {
			users.findByEmailForAuthentication.mockResolvedValue(
				buildUser({ passwordHash: await hash(credentials.password) }),
			);

			const session = await service.signIn(credentials, CONTEXT);

			expect(JSON.stringify(session)).not.toContain('argon2');
		});
	});

	describe('account enumeration', () => {
		it('stays silent when asked to resend to an unknown address', async () => {
			await expect(
				service.resendVerificationCode({ email: 'nobody@example.com' }),
			).resolves.toBeUndefined();

			expect(mailer.sendEmailVerificationCode).not.toHaveBeenCalled();
		});

		it('does not resend to an address that is already verified', async () => {
			users.findByEmail.mockResolvedValue(buildUser());

			await service.resendVerificationCode({ email: 'ada@example.com' });

			expect(mailer.sendEmailVerificationCode).not.toHaveBeenCalled();
		});

		it('stays silent when a password reset is asked for an unknown address', async () => {
			await expect(
				service.requestPasswordReset({ email: 'nobody@example.com' }),
			).resolves.toBeUndefined();

			expect(mailer.sendPasswordResetCode).not.toHaveBeenCalled();
		});

		it('sends the reset code when the account does exist', async () => {
			users.findByEmail.mockResolvedValue(buildUser());

			await service.requestPasswordReset({ email: 'ada@example.com' });

			expect(mailer.sendPasswordResetCode).toHaveBeenCalledWith(
				'ada@example.com',
				'Ada',
				'123456',
			);
		});
	});

	describe('verifyEmail', () => {
		it('spends the code and marks the address verified', async () => {
			users.findByEmail.mockResolvedValue(
				buildUser({ emailVerifiedAt: null }),
			);

			await service.verifyEmail(
				{ email: 'ada@example.com', code: '123456' },
				CONTEXT,
			);

			expect(verification.consume).toHaveBeenCalledWith('code-1');
			expect(users.markEmailVerified).toHaveBeenCalled();
		});

		it('refuses an address that is already verified', async () => {
			users.findByEmail.mockResolvedValue(buildUser());

			await expect(
				service.verifyEmail(
					{ email: 'ada@example.com', code: '123456' },
					CONTEXT,
				),
			).rejects.toMatchObject({
				response: { code: 'EMAIL_ALREADY_VERIFIED' },
			});
		});

		it('does not reveal that an address is unregistered', async () => {
			users.findByEmail.mockResolvedValue(null);

			await expect(
				service.verifyEmail(
					{ email: 'nobody@example.com', code: '123456' },
					CONTEXT,
				),
			).rejects.toMatchObject({ response: { code: 'INVALID_CODE' } });
		});
	});

	describe('resetPassword', () => {
		it('rejects a grant that does not verify', async () => {
			jwt.verifyAsync.mockRejectedValue(new Error('invalid signature'));

			await expect(
				service.resetPassword({
					resetToken: 'forged',
					password: 'Password1',
				}),
			).rejects.toMatchObject({
				response: { code: 'INVALID_RESET_TOKEN' },
			});
		});
	});

	describe('verifyPasswordResetCode', () => {
		it('does not spend the code, since the reset step still needs it', async () => {
			users.findByEmail.mockResolvedValue(buildUser());

			await service.verifyPasswordResetCode({
				email: 'ada@example.com',
				code: '123456',
			});

			expect(verification.consume).not.toHaveBeenCalled();
		});

		it('returns a grant for the new password screen', async () => {
			users.findByEmail.mockResolvedValue(buildUser());

			await expect(
				service.verifyPasswordResetCode({
					email: 'ada@example.com',
					code: '123456',
				}),
			).resolves.toBe('reset.grant');
		});
	});

	it('reports a forbidden account through a 403, not a 401', async () => {
		users.findByEmailForAuthentication.mockResolvedValue(
			buildUser({
				passwordHash: await hash('Password1'),
				status: UserStatus.Suspended,
			}),
		);

		await expect(
			service.signIn(
				{
					email: 'ada@example.com',
					password: 'Password1',
					keepSignedIn: false,
				},
				CONTEXT,
			),
		).rejects.toThrow(ForbiddenException);
	});
});
