import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { User } from '../users/entities/user.entity';
import { KycSubmission } from './entities/kyc-submission.entity';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([KycSubmission, User]),
		StorageModule,
		NotificationsModule,
	],
	controllers: [KycController],
	providers: [KycService],
})
export class KycModule {}
