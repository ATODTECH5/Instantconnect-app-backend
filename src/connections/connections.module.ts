import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StorageModule } from '../storage/storage.module';
import { User } from '../users/entities/user.entity';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';
import { Connection } from './entities/connection.entity';

@Module({
	imports: [TypeOrmModule.forFeature([Connection, User]), StorageModule],
	controllers: [ConnectionsController],
	providers: [ConnectionsService],
	exports: [ConnectionsService],
})
export class ConnectionsModule {}
