import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BlocksModule } from '../blocks/blocks.module';
import { ChatModule } from '../chat/chat.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { User } from '../users/entities/user.entity';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';
import { Connection } from './entities/connection.entity';

@Module({
	imports: [
		TypeOrmModule.forFeature([Connection, User]),
		StorageModule,
		BlocksModule,
		ChatModule,
		NotificationsModule,
	],
	controllers: [ConnectionsController],
	providers: [ConnectionsService],
	exports: [ConnectionsService],
})
export class ConnectionsModule {}
