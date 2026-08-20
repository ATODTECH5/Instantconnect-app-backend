import { z } from 'zod';

/**
 * Env vars arrive as strings, so `z.coerce.boolean()` is unusable here: it
 * treats every non-empty string as true, including 'false'.
 */
const booleanFromString = z
	.enum(['true', 'false'])
	.transform((value) => value === 'true');

/**
 * `KEY=` in a .env file arrives as an empty string, which is how people write
 * "not set". Treated as absent so an unfilled placeholder does not fail the boot.
 */
const optionalSecret = z.preprocess(
	(value) =>
		typeof value === 'string' && value.trim() === '' ? undefined : value,
	z.string().min(1).optional(),
);

const commaSeparated = z.string().transform((value) =>
	value
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean),
);

/** Backs the `DurationString` cast that `@nestjs/jwt` needs for `expiresIn`. */
const DURATION = /^\d+(ms|s|m|h|d|w|y)$/;
const DURATION_MESSAGE = 'Use a duration such as 15m, 24h or 7d';

export type DurationString = `${number}${
	'ms' | 's' | 'm' | 'h' | 'd' | 'w' | 'y'}`;

export const envSchema = z.object({
	NODE_ENV: z
		.enum(['development', 'test', 'production'])
		.default('development'),
	PORT: z.coerce.number().int().positive().default(3000),
	LOG_LEVEL: z
		.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
		.default('info'),
	CORS_ORIGINS: commaSeparated.default([]),

	DATABASE_URL: z.string().min(1),
	DATABASE_SSL: booleanFromString.default(true),
	DATABASE_POOL_SIZE: z.coerce.number().int().positive().max(20).default(10),
	DATABASE_LOGGING: booleanFromString.default(false),

	JWT_ACCESS_SECRET: z.string().min(32),
	JWT_ACCESS_TTL: z.string().regex(DURATION, DURATION_MESSAGE).default('15m'),
	JWT_PASSWORD_RESET_SECRET: z.string().min(32),
	JWT_PASSWORD_RESET_TTL: z
		.string()
		.regex(DURATION, DURATION_MESSAGE)
		.default('10m'),
	REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
	REFRESH_TOKEN_SESSION_TTL_DAYS: z.coerce
		.number()
		.int()
		.positive()
		.default(1),

	VERIFICATION_CODE_TTL_MINUTES: z.coerce
		.number()
		.int()
		.positive()
		.default(10),
	VERIFICATION_CODE_MAX_ATTEMPTS: z.coerce
		.number()
		.int()
		.positive()
		.default(5),

	/**
	 * Absent means no provider is bound and codes go to the log instead, which is
	 * the development default. Setting it is what switches real delivery on.
	 */
	RESEND_API_KEY: optionalSecret,

	/**
	 * Must be an address on a domain verified with the provider. Resend's shared
	 * `onboarding@resend.dev` sender works without a domain, but only delivers to
	 * the address that owns the Resend account.
	 */
	MAIL_FROM: z.string().default('Instant Connect <onboarding@resend.dev>'),

	THROTTLE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
	THROTTLE_LIMIT: z.coerce.number().int().positive().default(120),

	/** A kill switch, so the docs can be pulled without a redeploy. */
	SWAGGER_ENABLED: booleanFromString.default(true),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
	const result = envSchema.safeParse(raw);

	if (!result.success) {
		const details = result.error.issues
			.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
			.join('\n');

		throw new Error(`Invalid environment configuration:\n${details}`);
	}

	return result.data;
}
