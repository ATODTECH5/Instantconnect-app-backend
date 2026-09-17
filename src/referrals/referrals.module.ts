import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { User } from '../users/entities/user.entity';
import { Referral } from './entities/referral.entity';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';

/** Imported by auth, which records a referral at registration and reports the join at verification. */
@Module({
	imports: [
		TypeOrmModule.forFeature([Referral, User]),
		StorageModule,
		NotificationsModule,
	],
	controllers: [ReferralsController],
	providers: [ReferralsService],
	exports: [ReferralsService],
})
export class ReferralsModule {}
