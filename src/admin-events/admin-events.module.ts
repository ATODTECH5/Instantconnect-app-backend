import { Module } from '@nestjs/common';

import { StorageModule } from '../storage/storage.module';
import { AdminEventsController } from './admin-events.controller';
import { AdminEventsService } from './admin-events.service';

@Module({
	imports: [StorageModule],
	controllers: [AdminEventsController],
	providers: [AdminEventsService],
})
export class AdminEventsModule {}
