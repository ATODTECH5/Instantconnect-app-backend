import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { digestToken } from '../common/utils/hashing.util';
import type { User } from '../users/entities/user.entity';
import { UserRole } from '../users/entities/user-role.enum';
import { UsersService } from '../users/users.service';
import { authConfig } from '../config/configuration';
import { RefreshToken } from './entities/refresh-token.entity';
import type { SessionContext } from './token-payload';
import { TokensService } from './tokens.service';

const USER = {
	id: '11111111-1111-1111-1111-111111111111',
	email: 'ada@example.com',
	role: UserRole.User,
} as User;

const CONTEXT: SessionContext = {
	keepSignedIn: true,
	userAgent: 'InstantConnect/1.0',
	ipAddress: '127.0.0.1',
};

const config = {
	refreshTtlDays: 30,
	refreshSessionTtlDays: 1,
} as unknown as ReturnType<typeof authConfig>;

const buildStored = (overrides: Partial<RefreshToken> = {}): RefreshToken =>
	({
		id: 'row-1',
		userId: USER.id,
		tokenHash: 'unset',
		familyId: 'family-1',
		expiresAt: new Date(Date.now() + 86_400_000),
		revokedAt: null,
		...overrides,
	}) as RefreshToken;

/** Names what the service passes to the repository, so call args stay typed. */
type SavedTokens = [RefreshToken][];

type RepositoryMock = {
	create: jest.Mock;
	save: jest.Mock;
	findOne: jest.Mock;
	update: jest.Mock;
	manager: { transaction: jest.Mock };
};

describe('TokensService', () => {
	let service: TokensService;
	let repository: RepositoryMock;
	let users: { findById: jest.Mock };

	beforeEach(async () => {
		const manager = {
			transaction: jest.fn((run: (m: unknown) => unknown) =>
				run({
					update: jest.fn(),
					getRepository: () => repository,
				}),
			),
		};

		repository = {
			create: jest.fn((input: Partial<RefreshToken>) => input),
			save: jest.fn((input: Partial<RefreshToken>) => input),
			findOne: jest.fn(),
			update: jest.fn(),
			manager,
		};

		users = { findById: jest.fn().mockResolvedValue(USER) };

		const moduleRef = await Test.createTestingModule({
			providers: [
				TokensService,
				{
					provide: getRepositoryToken(RefreshToken),
					useValue: repository,
				},
				{
					provide: JwtService,
					useValue: {
						signAsync: jest
							.fn()
							.mockResolvedValue('access.jwt.token'),
						decode: jest.fn().mockReturnValue({
							exp: Math.floor(Date.now() / 1000) + 900,
						}),
					},
				},
				{ provide: UsersService, useValue: users },
				{ provide: authConfig.KEY, useValue: config },
			],
		}).compile();

		service = moduleRef.get(TokensService);
	});

	describe('issueSession', () => {
		it('persists only the digest of the token it hands out', async () => {
			const tokens = await service.issueSession(USER, CONTEXT);

			const [[saved]] = repository.save.mock.calls as SavedTokens;

			expect(saved.tokenHash).toBe(digestToken(tokens.refreshToken));
			expect(saved.tokenHash).not.toBe(tokens.refreshToken);
		});

		it('reports how long the access token lasts', async () => {
			const tokens = await service.issueSession(USER, CONTEXT);

			expect(tokens.accessTokenExpiresIn).toBeGreaterThan(880);
			expect(tokens.accessTokenExpiresIn).toBeLessThanOrEqual(900);
		});

		it('honours keep me signed in with the long lifetime', async () => {
			const tokens = await service.issueSession(USER, CONTEXT);
			const days =
				(tokens.refreshTokenExpiresAt.getTime() - Date.now()) /
				86_400_000;

			expect(Math.round(days)).toBe(30);
		});

		it('falls back to the short lifetime without it', async () => {
			const tokens = await service.issueSession(USER, {
				...CONTEXT,
				keepSignedIn: false,
			});
			const days =
				(tokens.refreshTokenExpiresAt.getTime() - Date.now()) /
				86_400_000;

			expect(Math.round(days)).toBe(1);
		});

		it('starts a new rotation family per sign in', async () => {
			await service.issueSession(USER, CONTEXT);
			await service.issueSession(USER, CONTEXT);

			const [first, second] = (
				repository.save.mock.calls as SavedTokens
			).map(([saved]) => saved.familyId);

			expect(first).not.toEqual(second);
		});
	});

	describe('rotate', () => {
		it('rejects a token that was never issued', async () => {
			repository.findOne.mockResolvedValue(null);

			await expect(service.rotate('nope', CONTEXT)).rejects.toThrow(
				UnauthorizedException,
			);
		});

		it('rejects an expired token', async () => {
			repository.findOne.mockResolvedValue(
				buildStored({ expiresAt: new Date(Date.now() - 1_000) }),
			);

			await expect(service.rotate('stale', CONTEXT)).rejects.toThrow(
				UnauthorizedException,
			);
		});

		it('revokes the whole family when an already rotated token comes back', async () => {
			repository.findOne.mockResolvedValue(
				buildStored({ revokedAt: new Date() }),
			);

			await expect(service.rotate('replayed', CONTEXT)).rejects.toThrow(
				UnauthorizedException,
			);

			expect(repository.update).toHaveBeenCalledWith(
				expect.objectContaining({ familyId: 'family-1' }),
				expect.objectContaining({
					revokedAt: expect.any(Date) as Date,
				}),
			);
		});

		it('rejects a token whose owner is gone', async () => {
			repository.findOne.mockResolvedValue(buildStored());
			users.findById.mockResolvedValue(null);

			await expect(service.rotate('orphan', CONTEXT)).rejects.toThrow(
				UnauthorizedException,
			);
		});

		it('issues the replacement into the same family', async () => {
			repository.findOne.mockResolvedValue(buildStored());

			await service.rotate('valid', CONTEXT);

			const [[saved]] = repository.save.mock.calls as SavedTokens;

			expect(saved.familyId).toBe('family-1');
		});

		it('keeps the original absolute expiry, so rotation cannot extend a session', async () => {
			const expiresAt = new Date(Date.now() + 3_600_000);
			repository.findOne.mockResolvedValue(buildStored({ expiresAt }));

			const tokens = await service.rotate('valid', CONTEXT);

			expect(tokens.refreshTokenExpiresAt).toEqual(expiresAt);
		});
	});

	describe('revokeAllForUser', () => {
		it('revokes every live token for the user', async () => {
			await service.revokeAllForUser(USER.id);

			expect(repository.update).toHaveBeenCalledWith(
				expect.objectContaining({ userId: USER.id }),
				expect.objectContaining({
					revokedAt: expect.any(Date) as Date,
				}),
			);
		});
	});
});
