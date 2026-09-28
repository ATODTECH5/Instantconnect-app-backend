import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BlocksModule } from '../blocks/blocks.module';
import { ChatModule } from '../chat/chat.module';
import { ConnectionsModule } from '../connections/connections.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { Category } from '../reference/entities/category.entity';
import { StorageModule } from '../storage/storage.module';
import { EventAttendee } from './entities/event-attendee.entity';
import { EventInvite } from './entities/event-invite.entity';
import { Event } from './entities/event.entity';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([Event, EventInvite, EventAttendee, Category]),
		StorageModule,
		BlocksModule,
		ChatModule,
		ConnectionsModule,
		NotificationsModule,
	],
	controllers: [EventsController],
	providers: [EventsService],
})
export class EventsModule {}
