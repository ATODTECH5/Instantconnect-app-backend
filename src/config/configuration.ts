import { registerAs } from '@nestjs/config';

import { validateEnv, type DurationString, type Env } from './env.validation';

/**
 * The single place in the codebase allowed to touch `process.env`. Memoised so
 * every namespace validates the same snapshot and a bad value fails the boot
 * once, with one readable message, rather than at each injection site.
 */
let snapshot: Env | undefined;

const env = (): Env => (snapshot ??= validateEnv(process.env));

export const appConfig = registerAs('app', () => {
	const e = env();

	return {
		env: e.NODE_ENV,
		isProduction: e.NODE_ENV === 'production',
		port: e.PORT,
		logLevel: e.LOG_LEVEL,
		corsOrigins: e.CORS_ORIGINS,
		swaggerEnabled: e.SWAGGER_ENABLED,
	};
});

export const databaseConfig = registerAs('database', () => {
	const e = env();

	return {
		url: e.DATABASE_URL,
		ssl: e.DATABASE_SSL,
		poolSize: e.DATABASE_POOL_SIZE,
		logging: e.DATABASE_LOGGING,
	};
});

export const authConfig = registerAs('auth', () => {
	const e = env();

	return {
		accessSecret: e.JWT_ACCESS_SECRET,
		accessTtl: e.JWT_ACCESS_TTL as DurationString,
		passwordResetSecret: e.JWT_PASSWORD_RESET_SECRET,
		passwordResetTtl: e.JWT_PASSWORD_RESET_TTL as DurationString,
		refreshTtlDays: e.REFRESH_TOKEN_TTL_DAYS,
		refreshSessionTtlDays: e.REFRESH_TOKEN_SESSION_TTL_DAYS,
		codeTtlMinutes: e.VERIFICATION_CODE_TTL_MINUTES,
		codeMaxAttempts: e.VERIFICATION_CODE_MAX_ATTEMPTS,
	};
});

export const mailConfig = registerAs('mail', () => ({ from: env().MAIL_FROM }));

export const throttleConfig = registerAs('throttle', () => {
	const e = env();

	return { ttlSeconds: e.THROTTLE_TTL_SECONDS, limit: e.THROTTLE_LIMIT };
});

export const configurations = [
	appConfig,
	databaseConfig,
	authConfig,
	mailConfig,
	throttleConfig,
];
