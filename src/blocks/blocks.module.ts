import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Connection } from '../connections/entities/connection.entity';
import { StorageModule } from '../storage/storage.module';
import { User } from '../users/entities/user.entity';
import { UserPhoto } from '../users/entities/user-photo.entity';
import { BlocksController } from './blocks.controller';
import { BlocksService } from './blocks.service';
import { Block } from './entities/block.entity';

/**
 * Deliberately imports no feature module: discovery, connections and chat
 * all import this one to ask "is this pair blocked?", so it cannot depend on
 * any of them without a cycle.
 */
@Module({
	imports: [
		TypeOrmModule.forFeature([Block, User, UserPhoto, Connection]),
		StorageModule,
	],
	controllers: [BlocksController],
	providers: [BlocksService],
	exports: [BlocksService],
})
export class BlocksModule {}
