import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { storageConfig } from '../config/configuration';
import { CloudinaryStorage } from './cloudinary-storage.service';
import { Storage } from './storage';
import { UnconfiguredStorage } from './unconfigured-storage.service';

/**
 * Mirrors {@link MailModule}: the provider is chosen by whether credentials are
 * present rather than by environment, so setting the keys is all it takes to
 * switch real uploads on.
 */
@Module({
	providers: [
		{
			provide: Storage,
			inject: [storageConfig.KEY],
			useFactory: (config: ConfigType<typeof storageConfig>): Storage =>
				config.isConfigured
					? new CloudinaryStorage(config)
					: new UnconfiguredStorage(),
		},
	],
	exports: [Storage],
})
export class StorageModule {}
