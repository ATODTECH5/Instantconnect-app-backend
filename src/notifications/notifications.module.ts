import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StorageModule } from '../storage/storage.module';
import { Notification } from './entities/notification.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/**
 * Deliberately knows nothing about sockets. Chat owns the gateway, and chat
 * raises notifications, so a dependency in this direction would be circular.
 * Callers store through this service and broadcast through the gateway.
 */
@Module({
	imports: [TypeOrmModule.forFeature([Notification]), StorageModule],
	controllers: [NotificationsController],
	providers: [NotificationsService],
	exports: [NotificationsService],
})
export class NotificationsModule {}
