import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminNotificationsController } from './admin-notifications.controller';
import { AdminNotificationsService } from './admin-notifications.service';
import { AdminNotificationCursor } from './entities/admin-notification-cursor.entity';
import { AdminNotificationRead } from './entities/admin-notification-read.entity';

@Module({
	imports: [
		TypeOrmModule.forFeature([
			AdminNotificationRead,
			AdminNotificationCursor,
		]),
	],
	controllers: [AdminNotificationsController],
	providers: [AdminNotificationsService],
})
export class AdminNotificationsModule {}
