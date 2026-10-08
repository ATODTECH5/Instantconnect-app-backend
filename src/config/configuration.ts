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
		refreshSessionTtlDays: e.REFRESH_TOKEN_SESSION_TTL_DAYS,
		adminCookieDomain: e.ADMIN_COOKIE_DOMAIN,
		secureCookies: e.NODE_ENV === 'production',
		codeTtlMinutes: e.VERIFICATION_CODE_TTL_MINUTES,
		codeMaxAttempts: e.VERIFICATION_CODE_MAX_ATTEMPTS,
	};
});

export const mailConfig = registerAs('mail', () => {
	const e = env();

	return { from: e.MAIL_FROM, resendApiKey: e.RESEND_API_KEY };
});

export const storageConfig = registerAs('storage', () => {
	const e = env();

	return {
		cloudName: e.CLOUDINARY_CLOUD_NAME,
		apiKey: e.CLOUDINARY_API_KEY,
		apiSecret: e.CLOUDINARY_API_SECRET,
		uploadFolder: e.CLOUDINARY_UPLOAD_FOLDER,
		chatFolder: e.CLOUDINARY_CHAT_FOLDER,
		kycFolder: e.CLOUDINARY_KYC_FOLDER,
		eventsFolder: e.CLOUDINARY_EVENTS_FOLDER,
		communitiesFolder: e.CLOUDINARY_COMMUNITIES_FOLDER,
		isConfigured: Boolean(
			e.CLOUDINARY_CLOUD_NAME &&
			e.CLOUDINARY_API_KEY &&
			e.CLOUDINARY_API_SECRET,
		),
	};
});

export const pushConfig = registerAs('push', () => {
	const e = env();

	return { expoAccessToken: e.EXPO_ACCESS_TOKEN };
});

export const externalEventsConfig = registerAs('externalEvents', () => {
	const e = env();

	return { eventbriteToken: e.EVENTBRITE_TOKEN };
});

export const paymentsConfig = registerAs('payments', () => {
	const e = env();

	return {
		paystackSecretKey: e.PAYSTACK_SECRET_KEY,
		callbackUrl: e.PAYSTACK_CALLBACK_URL,
		publicApiUrl: e.PUBLIC_API_URL?.replace(/\/+$/, ''),
	};
});

export const appReleaseConfig = registerAs('appRelease', () => {
	const e = env();

	return {
		minimumVersion: e.MIN_APP_VERSION ?? null,
		appStoreUrl: e.APP_STORE_URL ?? null,
		playStoreUrl: e.PLAY_STORE_URL ?? null,
	};
});

export const throttleConfig = registerAs('throttle', () => {
	const e = env();

	return { ttlSeconds: e.THROTTLE_TTL_SECONDS, limit: e.THROTTLE_LIMIT };
});

export const configurations = [
	appConfig,
	databaseConfig,
	authConfig,
	mailConfig,
	storageConfig,
	pushConfig,
	externalEventsConfig,
	paymentsConfig,
	appReleaseConfig,
	throttleConfig,
];
