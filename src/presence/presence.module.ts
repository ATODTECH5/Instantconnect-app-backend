import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from '../users/entities/user.entity';
import { PresenceRegistry } from './presence-registry';
import { PresenceService } from './presence.service';

@Module({
	imports: [TypeOrmModule.forFeature([User])],
	providers: [PresenceService, PresenceRegistry],
	exports: [PresenceService, PresenceRegistry],
})
export class PresenceModule {}
