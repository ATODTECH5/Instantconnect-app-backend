import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { appConfig } from '../config/configuration';
import { Mailer } from './mailer';

/**
 * Development stand in: prints the code so the mobile app's verification and
 * reset flows are testable without a mail provider. It shouts in production
 * because reaching here there means a real provider was never bound.
 */
@Injectable()
export class LoggerMailer extends Mailer {
	private readonly logger = new Logger(LoggerMailer.name);

	constructor(
		@Inject(appConfig.KEY)
		private readonly config: ConfigType<typeof appConfig>,
	) {
		super();
	}

	sendEmailVerificationCode(
		to: string,
		firstName: string,
		code: string,
	): Promise<void> {
		return this.deliver('email verification', to, firstName, code);
	}

	sendPasswordResetCode(
		to: string,
		firstName: string,
		code: string,
	): Promise<void> {
		return this.deliver('password reset', to, firstName, code);
	}

	private deliver(
		kind: string,
		to: string,
		firstName: string,
		code: string,
	): Promise<void> {
		if (this.config.isProduction) {
			this.logger.error(
				`No mail provider is configured, so the ${kind} email to ${to} was not sent.`,
			);

			return Promise.resolve();
		}

		this.logger.log(`${kind} code for ${firstName} <${to}>: ${code}`);

		return Promise.resolve();
	}
}
