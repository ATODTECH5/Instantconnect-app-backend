import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { NotificationPreference } from '../settings/entities/notification-preference.entity';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { StorageModule } from '../storage/storage.module';
import { Notification } from './entities/notification.entity';
import { PushToken } from './entities/push-token.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushService } from './push/push.service';

/**
 * Deliberately knows nothing about sockets. Chat owns the gateway, and chat
 * raises notifications, so a dependency in this direction would be circular.
 * Callers store through this service and broadcast through the gateway.
 *
 * Push is the exception that proves the rule: it needs no gateway, so the
 * service starts it itself. Preferences are read straight from their table
 * rather than through SettingsModule, which would only be a longer route to
 * the same row.
 */
@Module({
	imports: [
		TypeOrmModule.forFeature([
			Notification,
			PushToken,
			NotificationPreference,
		]),
		StorageModule,
		PlatformSettingsModule,
	],
	controllers: [NotificationsController],
	providers: [NotificationsService, PushService],
	exports: [NotificationsService],
})
export class NotificationsModule {}
