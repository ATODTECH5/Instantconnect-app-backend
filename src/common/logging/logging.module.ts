import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { LoggerModule } from 'nestjs-pino';

import { appConfig } from '../../config/configuration';
import type { RequestWithId } from '../types/request';

/**
 * Anything listed here is replaced in the log output rather than removed, so a
 * leaked field shows up as a redaction during review instead of silently
 * vanishing. Every path an inbound secret can travel belongs in this list.
 */
const REDACTED_PATHS = [
	'req.headers.authorization',
	'req.headers.cookie',
	'req.body.password',
	'req.body.confirmPassword',
	'req.body.currentPassword',
	'req.body.refreshToken',
	'req.body.resetToken',
	'req.body.code',
	'req.body.pin',
	'res.headers["set-cookie"]',
];

@Module({
	imports: [
		LoggerModule.forRootAsync({
			inject: [appConfig.KEY],
			useFactory: (config: ConfigType<typeof appConfig>) => ({
				pinoHttp: {
					level: config.logLevel,
					redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
					// Honouring an inbound id lets a trace span the client, a gateway and
					// this service; generating one keeps every log line correlatable.
					genReqId: (req: RequestWithId) =>
						(req.headers['x-request-id'] as string | undefined) ??
						randomUUID(),
					autoLogging: { ignore: (req) => req.url === '/health' },
					transport: config.isProduction
						? undefined
						: {
								target: 'pino-pretty',
								options: { singleLine: true },
							},
				},
			}),
		}),
	],
})
export class LoggingModule {}
