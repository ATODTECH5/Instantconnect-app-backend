import { Controller, Get, Inject } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
	ApiOkResponse,
	ApiOperation,
	ApiProperty,
	ApiTags,
} from '@nestjs/swagger';

import { AllowDuringMaintenance } from '../common/decorators/allow-during-maintenance.decorator';
import { Public } from '../common/decorators/public.decorator';
import { appReleaseConfig } from '../config/configuration';

export class AppReleaseDto {
	@ApiProperty({
		nullable: true,
		example: '1.2.0',
		description:
			'Apps older than this must update before they can be used.',
	})
	minimumVersion!: string | null;

	@ApiProperty({ nullable: true })
	appStoreUrl!: string | null;

	@ApiProperty({ nullable: true })
	playStoreUrl!: string | null;
}

/**
 * Read by the app at launch, before sign-in, so it stays public and answers
 * during maintenance. Changing the minimum is an env change on the server,
 * which reaches every installed app without a release.
 */
@ApiTags('App')
@Public()
@AllowDuringMaintenance()
@Controller('app')
export class AppReleaseController {
	constructor(
		@Inject(appReleaseConfig.KEY)
		private readonly config: ConfigType<typeof appReleaseConfig>,
	) {}

	@ApiOperation({ summary: 'Minimum supported app version and store links' })
	@ApiOkResponse({ type: AppReleaseDto })
	@Get('release')
	release(): AppReleaseDto {
		return {
			minimumVersion: this.config.minimumVersion,
			appStoreUrl: this.config.appStoreUrl,
			playStoreUrl: this.config.playStoreUrl,
		};
	}
}
