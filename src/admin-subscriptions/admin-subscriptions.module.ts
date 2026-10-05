import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StorageModule } from '../storage/storage.module';
import { SubscriptionPlan } from '../subscriptions/entities/subscription-plan.entity';
import { Subscription } from '../subscriptions/entities/subscription.entity';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AdminSubscriptionsController } from './admin-subscriptions.controller';
import { AdminSubscriptionsService } from './admin-subscriptions.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([SubscriptionPlan, Subscription]),
		StorageModule,
		SubscriptionsModule,
	],
	controllers: [AdminSubscriptionsController],
	providers: [AdminSubscriptionsService],
})
export class AdminSubscriptionsModule {}
