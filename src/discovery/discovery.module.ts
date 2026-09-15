import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BlocksModule } from '../blocks/blocks.module';
import { ConnectionsModule } from '../connections/connections.module';
import { PresenceModule } from '../presence/presence.module';
import { StorageModule } from '../storage/storage.module';
import { User } from '../users/entities/user.entity';
import { UserPhoto } from '../users/entities/user-photo.entity';
import { DiscoveryController } from './discovery.controller';
import { DiscoveryService } from './discovery.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([User, UserPhoto]),
		BlocksModule,
		ConnectionsModule,
		StorageModule,
		PresenceModule,
	],
	controllers: [DiscoveryController],
	providers: [DiscoveryService],
})
export class DiscoveryModule {}
