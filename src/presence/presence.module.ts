import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from '../users/entities/user.entity';
import { PresenceService } from './presence.service';

@Module({
	imports: [TypeOrmModule.forFeature([User])],
	providers: [PresenceService],
	exports: [PresenceService],
})
export class PresenceModule {}
