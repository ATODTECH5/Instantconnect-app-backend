import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminPlatformSettingsController } from './admin-platform-settings.controller';
import { PlatformSettings } from './entities/platform-settings.entity';
import { PlatformSettingsService } from './platform-settings.service';

@Module({
	imports: [TypeOrmModule.forFeature([PlatformSettings])],
	controllers: [AdminPlatformSettingsController],
	providers: [PlatformSettingsService],
	exports: [PlatformSettingsService],
})
export class PlatformSettingsModule {}
