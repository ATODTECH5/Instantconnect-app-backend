import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { appConfig, authConfig, mailConfig } from '../config/configuration';
import { LoggerMailer } from './logger-mailer.service';
import { Mailer } from './mailer';
import { ResendMailer } from './resend-mailer.service';

/**
 * The provider is chosen by whether an API key is configured rather than by
 * environment, so a developer who wants real mail gets it by setting the key,
 * and one who does not keeps the log stand in without editing code.
 */
@Module({
	providers: [
		{
			provide: Mailer,
			inject: [mailConfig.KEY, authConfig.KEY, appConfig.KEY],
			useFactory: (
				mail: ConfigType<typeof mailConfig>,
				auth: ConfigType<typeof authConfig>,
				app: ConfigType<typeof appConfig>,
			): Mailer =>
				mail.resendApiKey
					? new ResendMailer(mail, auth)
					: new LoggerMailer(app),
		},
	],
	exports: [Mailer],
})
export class MailModule {}
