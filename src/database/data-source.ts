import { DataSource } from 'typeorm';

import { databaseConfig } from '../config/configuration';
import { buildDataSourceOptions } from './data-source-options';

/**
 * Entry point for the TypeORM CLI only. The running application builds its
 * options through {@link DatabaseModule} instead. Globs are safe here because
 * the CLI always runs against TypeScript sources, never against dist.
 */
export default new DataSource(
	buildDataSourceOptions(databaseConfig(), {
		entities: ['src/**/*.entity.ts'],
		migrations: ['src/database/migrations/*.ts'],
	}),
);
