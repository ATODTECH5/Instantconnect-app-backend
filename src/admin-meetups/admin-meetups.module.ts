import { Module } from '@nestjs/common';

import { ChatModule } from '../chat/chat.module';
import { MeetupsModule } from '../meetups/meetups.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { AdminMeetupsController } from './admin-meetups.controller';
import { AdminMeetupsService } from './admin-meetups.service';

@Module({
	imports: [StorageModule, MeetupsModule, NotificationsModule, ChatModule],
	controllers: [AdminMeetupsController],
	providers: [AdminMeetupsService],
})
export class AdminMeetupsModule {}
