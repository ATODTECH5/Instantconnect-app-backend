import {
	BadRequestException,
	HttpException,
	HttpStatus,
	Inject,
	Injectable,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';

import {
	generateNumericCode,
	hashSecret,
	verifySecret,
} from '../common/utils/hashing.util';
import { authConfig } from '../config/configuration';
import { VerificationCode } from './entities/verification-code.entity';
import { VerificationPurpose } from './entities/verification-purpose.enum';

const CODE_LENGTH = 4;

@Injectable()
export class VerificationService {
	constructor(
		@InjectRepository(VerificationCode)
		private readonly codes: Repository<VerificationCode>,
		@Inject(authConfig.KEY)
		private readonly config: ConfigType<typeof authConfig>,
	) {}

	/**
	 * Returns the plaintext code for delivery; only its hash is stored. Any
	 * outstanding code for the same purpose is retired first, so a resend cannot
	 * leave two working codes in circulation.
	 */
	async issue(userId: string, purpose: VerificationPurpose): Promise<string> {
		await this.retireOutstanding(userId, purpose);

		const code = generateNumericCode(CODE_LENGTH);

		await this.codes.save(
			this.codes.create({
				userId,
				purpose,
				codeHash: await hashSecret(code),
				expiresAt: new Date(
					Date.now() + this.config.codeTtlMinutes * 60 * 1000,
				),
			}),
		);

		return code;
	}

	/** Checks a code without spending it, so the caller decides when it is consumed. */
	async verify(
		userId: string,
		purpose: VerificationPurpose,
		code: string,
	): Promise<VerificationCode> {
		const record = await this.codes.findOne({
			where: {
				userId,
				purpose,
				consumedAt: IsNull(),
				expiresAt: MoreThan(new Date()),
			},
			order: { createdAt: 'DESC' },
		});

		if (!record) throw this.invalidCode();

		if (record.attempts >= this.config.codeMaxAttempts) {
			throw new HttpException(
				{
					code: 'TOO_MANY_ATTEMPTS',
					message: 'Too many incorrect attempts. Request a new code.',
				},
				HttpStatus.TOO_MANY_REQUESTS,
			);
		}

		if (!(await verifySecret(record.codeHash, code))) {
			await this.codes.increment({ id: record.id }, 'attempts', 1);

			throw this.invalidCode();
		}

		return record;
	}

	async consume(codeId: string): Promise<void> {
		await this.codes.update(codeId, { consumedAt: new Date() });
	}

	private async retireOutstanding(
		userId: string,
		purpose: VerificationPurpose,
	): Promise<void> {
		await this.codes.update(
			{ userId, purpose, consumedAt: IsNull() },
			{ consumedAt: new Date() },
		);
	}

	private invalidCode(): BadRequestException {
		return new BadRequestException({
			code: 'INVALID_CODE',
			message: 'That code is not correct. Check it and try again.',
		});
	}
}
