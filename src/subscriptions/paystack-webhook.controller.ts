import {
	Controller,
	Headers,
	HttpCode,
	HttpStatus,
	Logger,
	Post,
	type RawBodyRequest,
	Req,
	UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';

import { AllowDuringMaintenance } from '../common/decorators/allow-during-maintenance.decorator';
import { Public } from '../common/decorators/public.decorator';
import { PaystackClient } from './paystack.client';
import { SubscriptionsService } from './subscriptions.service';

/**
 * Paystack's server to server notifications. Public, but nothing is acted on
 * unless the signature proves Paystack sent it. Paystack retries anything
 * that is not a 200, and handling is idempotent, so a failure is thrown back
 * for a retry rather than swallowed.
 */
@ApiExcludeController()
@Public()
@AllowDuringMaintenance()
@SkipThrottle()
@Controller('webhooks/paystack')
export class PaystackWebhookController {
	private readonly logger = new Logger(PaystackWebhookController.name);

	constructor(
		private readonly paystack: PaystackClient,
		private readonly subscriptions: SubscriptionsService,
	) {}

	@Post()
	@HttpCode(HttpStatus.OK)
	async receive(
		@Req() request: RawBodyRequest<Request>,
		@Headers('x-paystack-signature') signature: string | undefined,
	): Promise<void> {
		if (
			!request.rawBody ||
			!this.paystack.isValidSignature(request.rawBody, signature)
		) {
			throw new UnauthorizedException({
				code: 'INVALID_SIGNATURE',
				message: 'Signature check failed.',
			});
		}

		const event = request.body as {
			event: string;
			data: Record<string, unknown>;
		};

		this.logger.log(`Paystack ${event.event}`);
		await this.subscriptions.handleWebhook(event);
	}
}
