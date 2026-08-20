import {
	Inject,
	Injectable,
	Logger,
	ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Resend } from 'resend';

import { authConfig, mailConfig } from '../config/configuration';
import { codeEmail, type CodeEmailKind } from './code-email';
import { Mailer } from './mailer';

@Injectable()
export class ResendMailer extends Mailer {
	private readonly logger = new Logger(ResendMailer.name);
	private readonly resend: Resend;

	constructor(
		@Inject(mailConfig.KEY)
		private readonly mail: ConfigType<typeof mailConfig>,
		@Inject(authConfig.KEY)
		private readonly auth: ConfigType<typeof authConfig>,
	) {
		super();
		this.resend = new Resend(this.mail.resendApiKey);
	}

	sendEmailVerificationCode(
		to: string,
		firstName: string,
		code: string,
	): Promise<void> {
		return this.deliver('email-verification', to, firstName, code);
	}

	sendPasswordResetCode(
		to: string,
		firstName: string,
		code: string,
	): Promise<void> {
		return this.deliver('password-reset', to, firstName, code);
	}

	private async deliver(
		kind: CodeEmailKind,
		to: string,
		firstName: string,
		code: string,
	): Promise<void> {
		const { subject, html, text } = codeEmail(
			kind,
			firstName,
			code,
			this.auth.codeTtlMinutes,
		);

		// Resend reports a rejected send in the payload rather than by throwing,
		// so leaving this unchecked would make a bounce look like a delivery.
		const { data, error } = await this.resend.emails.send({
			from: this.mail.from,
			to,
			subject,
			html,
			text,
		});

		if (error) {
			// The provider's message can name the recipient and the sending domain,
			// so it goes to the log and the caller gets copy that is safe to show.
			this.logger.error(
				`Resend rejected the ${kind} email to ${to}: ${error.name} ${error.message}`,
			);

			throw new ServiceUnavailableException({
				code: 'MAIL_DELIVERY_FAILED',
				message:
					'We could not send your code right now. Please try again in a moment.',
			});
		}

		this.logger.log(`Sent ${kind} email to ${to} (id ${data.id})`);
	}
}
