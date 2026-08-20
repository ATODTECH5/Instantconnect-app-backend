import { BadRequestException, HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { hashSecret, verifySecret } from '../common/utils/hashing.util';
import { authConfig } from '../config/configuration';
import { VerificationCode } from './entities/verification-code.entity';
import { VerificationPurpose } from './entities/verification-purpose.enum';
import { VerificationService } from './verification.service';

const USER_ID = '11111111-1111-1111-1111-111111111111';

const config = {
	codeTtlMinutes: 10,
	codeMaxAttempts: 5,
} as unknown as ReturnType<typeof authConfig>;

const buildRecord = (
	overrides: Partial<VerificationCode> = {},
): VerificationCode =>
	({
		id: 'code-1',
		userId: USER_ID,
		purpose: VerificationPurpose.EmailVerification,
		codeHash: 'unset',
		expiresAt: new Date(Date.now() + 60_000),
		consumedAt: null,
		attempts: 0,
		...overrides,
	}) as VerificationCode;

/** Names what the service passes to the repository, so call args stay typed. */
type SavedCodes = [VerificationCode][];
type UpdateCalls = [Partial<VerificationCode>, Partial<VerificationCode>][];

type RepositoryMock = {
	create: jest.Mock;
	save: jest.Mock;
	findOne: jest.Mock;
	update: jest.Mock;
	increment: jest.Mock;
};

describe('VerificationService', () => {
	let service: VerificationService;
	let repository: RepositoryMock;

	beforeEach(async () => {
		repository = {
			create: jest.fn((input: Partial<VerificationCode>) => input),
			save: jest.fn((input: Partial<VerificationCode>) => input),
			findOne: jest.fn(),
			update: jest.fn(),
			increment: jest.fn(),
		};

		const moduleRef = await Test.createTestingModule({
			providers: [
				VerificationService,
				{
					provide: getRepositoryToken(VerificationCode),
					useValue: repository,
				},
				{ provide: authConfig.KEY, useValue: config },
			],
		}).compile();

		service = moduleRef.get(VerificationService);
	});

	describe('issue', () => {
		it('stores a hash the code verifies against, never the code itself', async () => {
			const code = await service.issue(
				USER_ID,
				VerificationPurpose.EmailVerification,
			);

			const [[saved]] = repository.save.mock.calls as SavedCodes;

			expect(saved.codeHash).not.toContain(code);
			await expect(verifySecret(saved.codeHash, code)).resolves.toBe(
				true,
			);
		});

		it('returns a four digit code', async () => {
			await expect(
				service.issue(USER_ID, VerificationPurpose.EmailVerification),
			).resolves.toMatch(/^\d{4}$/);
		});

		it('retires any outstanding code first, so a resend leaves only one valid', async () => {
			await service.issue(USER_ID, VerificationPurpose.PasswordReset);

			const [[criteria]] = repository.update.mock.calls as UpdateCalls;

			expect(criteria).toMatchObject({
				userId: USER_ID,
				purpose: VerificationPurpose.PasswordReset,
			});
			expect(repository.update.mock.invocationCallOrder[0]).toBeLessThan(
				repository.save.mock.invocationCallOrder[0],
			);
		});

		it('expires the code after the configured window', async () => {
			const before = Date.now();

			await service.issue(USER_ID, VerificationPurpose.EmailVerification);

			const after = Date.now();
			const [[saved]] = repository.save.mock.calls as SavedCodes;
			const expiry = saved.expiresAt.getTime();

			// Bounded at both ends of the call, since hashing takes real time.
			expect(expiry).toBeGreaterThanOrEqual(before + 10 * 60_000);
			expect(expiry).toBeLessThanOrEqual(after + 10 * 60_000);
		});
	});

	describe('verify', () => {
		it('rejects when no unconsumed, unexpired code exists', async () => {
			repository.findOne.mockResolvedValue(null);

			await expect(
				service.verify(
					USER_ID,
					VerificationPurpose.EmailVerification,
					'123456',
				),
			).rejects.toThrow(BadRequestException);
		});

		it('returns the record when the code matches', async () => {
			const record = buildRecord({
				codeHash: await hashSecret('123456'),
			});
			repository.findOne.mockResolvedValue(record);

			await expect(
				service.verify(
					USER_ID,
					VerificationPurpose.EmailVerification,
					'123456',
				),
			).resolves.toBe(record);
		});

		it('counts a wrong code against the attempt budget', async () => {
			repository.findOne.mockResolvedValue(
				buildRecord({ codeHash: await hashSecret('123456') }),
			);

			await expect(
				service.verify(
					USER_ID,
					VerificationPurpose.EmailVerification,
					'000000',
				),
			).rejects.toThrow(BadRequestException);

			expect(repository.increment).toHaveBeenCalledWith(
				{ id: 'code-1' },
				'attempts',
				1,
			);
		});

		it('locks the code out once the attempt budget is spent', async () => {
			repository.findOne.mockResolvedValue(
				buildRecord({
					codeHash: await hashSecret('123456'),
					attempts: 5,
				}),
			);

			await expect(
				service.verify(
					USER_ID,
					VerificationPurpose.EmailVerification,
					'123456',
				),
			).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
		});

		it('does not spend the code, so the caller decides when it is consumed', async () => {
			repository.findOne.mockResolvedValue(
				buildRecord({ codeHash: await hashSecret('123456') }),
			);

			await service.verify(
				USER_ID,
				VerificationPurpose.EmailVerification,
				'123456',
			);

			expect(repository.update).not.toHaveBeenCalled();
		});
	});
});
