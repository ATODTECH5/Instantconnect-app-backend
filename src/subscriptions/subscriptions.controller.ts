import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	Post,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiConflictResponse,
	ApiNotFoundResponse,
	ApiOkResponse,
	ApiOperation,
	ApiServiceUnavailableResponse,
	ApiTags,
	ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiErrorDto } from '../common/dto/api-error.dto';
import {
	CheckoutDto,
	CheckoutResponseDto,
	CheckoutResultDto,
	MySubscriptionDto,
	PlanDto,
} from './dto/subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('Subscriptions')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED', type: ApiErrorDto })
@Controller('subscriptions')
export class SubscriptionsController {
	constructor(private readonly subscriptions: SubscriptionsService) {}

	@ApiOperation({ summary: 'Paid plans, cheapest first' })
	@ApiOkResponse({ type: [PlanDto] })
	@Get('plans')
	plans(): Promise<PlanDto[]> {
		return this.subscriptions.listPlans();
	}

	@ApiOperation({
		summary: 'The viewer’s plan',
		description: 'planId is "free" with no live subscription.',
	})
	@ApiOkResponse({ type: MySubscriptionDto })
	@Get('me')
	me(@CurrentUser('id') userId: string): Promise<MySubscriptionDto> {
		return this.subscriptions.current(userId);
	}

	@ApiOperation({
		summary: 'Start a checkout',
		description:
			'Returns Paystack’s hosted checkout page. Card details are entered there, never in the app. Choosing another plan replaces the current one once paid.',
	})
	@ApiOkResponse({ type: CheckoutResponseDto })
	@ApiNotFoundResponse({ description: 'PLAN_NOT_FOUND', type: ApiErrorDto })
	@ApiConflictResponse({
		description: 'ALREADY_SUBSCRIBED',
		type: ApiErrorDto,
	})
	@ApiServiceUnavailableResponse({
		description: 'PAYMENTS_NOT_CONFIGURED, PAYMENT_PROVIDER_UNREACHABLE',
		type: ApiErrorDto,
	})
	@Post('checkout')
	@HttpCode(HttpStatus.OK)
	checkout(
		@CurrentUser('id') userId: string,
		@Body() dto: CheckoutDto,
	): Promise<CheckoutResponseDto> {
		return this.subscriptions.checkout(userId, dto.planId, dto.cycle);
	}

	@ApiOperation({
		summary: 'Confirm a checkout',
		description:
			'Verifies the payment with Paystack and activates the plan. Safe to call more than once.',
	})
	@ApiOkResponse({ type: CheckoutResultDto })
	@ApiNotFoundResponse({
		description: 'PAYMENT_NOT_FOUND',
		type: ApiErrorDto,
	})
	@Get('checkout/:reference')
	confirm(
		@CurrentUser('id') userId: string,
		@Param('reference') reference: string,
	): Promise<CheckoutResultDto> {
		return this.subscriptions.confirm(userId, reference);
	}

	@ApiOperation({
		summary: 'Cancel renewal',
		description: 'The plan stays until currentPeriodEnd, then ends.',
	})
	@ApiOkResponse({ type: MySubscriptionDto })
	@ApiConflictResponse({
		description: 'SUBSCRIPTION_NOT_READY',
		type: ApiErrorDto,
	})
	@Post('me/cancel')
	@HttpCode(HttpStatus.OK)
	cancel(@CurrentUser('id') userId: string): Promise<MySubscriptionDto> {
		return this.subscriptions.cancel(userId);
	}
}
