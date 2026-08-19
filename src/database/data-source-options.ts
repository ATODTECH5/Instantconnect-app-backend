import type { DataSourceOptions } from 'typeorm';

import type { databaseConfig } from '../config/configuration';
import type { ConfigType } from '@nestjs/config';

type DatabaseConfig = ConfigType<typeof databaseConfig>;

/**
 * Shared by the Nest module and the migration CLI so the two can never drift.
 *
 * Neon puts a connection pooler in front of a compute that suspends when idle,
 * so the pool stays small (the pooler multiplexes for us) and the connect
 * timeout is generous enough to absorb a cold start.
 */
export function buildDataSourceOptions(
	config: DatabaseConfig,
	overrides: Partial<DataSourceOptions> = {},
): DataSourceOptions {
	return {
		type: 'postgres',
		url: config.url,
		ssl: config.ssl ? { rejectUnauthorized: true } : false,
		poolSize: config.poolSize,
		connectTimeoutMS: 15_000,
		applicationName: 'instant-connect-server',
		logging: config.logging
			? ['query', 'error', 'warn']
			: ['error', 'warn'],
		synchronize: false,
		migrationsRun: false,
		migrationsTableName: 'migrations',
		// Resolves uuid defaults to the built in gen_random_uuid() rather than the
		// uuid-ossp function, which lets us skip installing an extension entirely.
		uuidExtension: 'pgcrypto',
		installExtensions: false,
		...overrides,
	} as DataSourceOptions;
}
