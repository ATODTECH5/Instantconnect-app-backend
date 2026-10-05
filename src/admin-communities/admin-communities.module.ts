import { Module } from '@nestjs/common';

import { CommunitiesModule } from '../communities/communities.module';
import { StorageModule } from '../storage/storage.module';
import { AdminCommunitiesController } from './admin-communities.controller';
import { AdminCommunitiesService } from './admin-communities.service';

@Module({
	imports: [CommunitiesModule, StorageModule],
	controllers: [AdminCommunitiesController],
	providers: [AdminCommunitiesService],
})
export class AdminCommunitiesModule {}
