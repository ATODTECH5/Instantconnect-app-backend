import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ChatModule } from '../chat/chat.module';
import { ConnectionsModule } from '../connections/connections.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { Category } from '../reference/entities/category.entity';
import { StorageModule } from '../storage/storage.module';
import { EventInvite } from './entities/event-invite.entity';
import { Event } from './entities/event.entity';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([Event, EventInvite, Category]),
		StorageModule,
		ChatModule,
		ConnectionsModule,
		NotificationsModule,
	],
	controllers: [EventsController],
	providers: [EventsService],
})
export class EventsModule {}
