import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Payment } from './entities/payment.entity';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { Subscription } from './entities/subscription.entity';
import { PaystackWebhookController } from './paystack-webhook.controller';
import { PaystackClient } from './paystack.client';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([SubscriptionPlan, Subscription, Payment]),
	],
	controllers: [SubscriptionsController, PaystackWebhookController],
	providers: [PaystackClient, SubscriptionsService],
	exports: [PaystackClient, SubscriptionsService],
})
export class SubscriptionsModule {}
