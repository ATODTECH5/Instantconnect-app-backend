import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminPlatformSettingsController } from './admin-platform-settings.controller';
import { ContentPolicyService } from './content-policy.service';
import { PlatformSettings } from './entities/platform-settings.entity';
import { PlatformSettingsService } from './platform-settings.service';

@Module({
	imports: [TypeOrmModule.forFeature([PlatformSettings])],
	controllers: [AdminPlatformSettingsController],
	providers: [PlatformSettingsService, ContentPolicyService],
	exports: [PlatformSettingsService, ContentPolicyService],
})
export class PlatformSettingsModule {}
