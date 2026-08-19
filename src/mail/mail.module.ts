import { Module } from '@nestjs/common';

import { LoggerMailer } from './logger-mailer.service';
import { Mailer } from './mailer';

@Module({
	providers: [{ provide: Mailer, useClass: LoggerMailer }],
	exports: [Mailer],
})
export class MailModule {}
