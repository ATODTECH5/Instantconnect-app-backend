import { createHmac, timingSafeEqual } from 'node:crypto';

import {
	BadGatewayException,
	Inject,
	Injectable,
	ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { paymentsConfig } from '../config/configuration';

const API_URL = 'https://api.paystack.co';

const CANCEL_URL = 'https://standard.paystack.co/close';
const TIMEOUT_MS = 15_000;

type Envelope<T> = { status: boolean; message: string; data: T };

export type PaystackTransaction = {
	reference: string;
	status:
		'success' | 'failed' | 'abandoned' | 'ongoing' | 'pending' | 'reversed';
	amount: number;
	currency: string;
	channel: string | null;
	paid_at: string | null;
	gateway_response: string | null;
	customer: { email: string; customer_code: string };
	plan: { plan_code: string } | string | null;
	authorization?: {
		authorization_code?: string;
		card_type?: string | null;
		last4?: string | null;
		exp_month?: string | null;
		exp_year?: string | null;
		bank?: string | null;
		reusable?: boolean;
	} | null;
	metadata:
		{ userId?: string; planId?: string; cycle?: string } | string | null;
};

export type PaystackSubscription = {
	subscription_code: string;
	email_token: string | null;
	status: string;
	plan: { plan_code?: string } | null;
};

export type PaystackInitialized = {
	authorization_url: string;
	access_code: string;
	reference: string;
};

/**
 * The few Paystack endpoints subscriptions need. Card details never pass
 * through here: the member pays on Paystack's own checkout page.
 * https://paystack.com/docs/api/
 */
@Injectable()
export class PaystackClient {
	constructor(
		@Inject(paymentsConfig.KEY)
		private readonly config: ConfigType<typeof paymentsConfig>,
	) {}

	get isConfigured(): boolean {
		return Boolean(this.config.paystackSecretKey);
	}

	/** Test keys start sk_test_; anything else is treated as live money. */
	get isTestMode(): boolean {
		return this.config.paystackSecretKey?.startsWith('sk_test_') ?? true;
	}

	get callbackUrl(): string {
		return this.config.callbackUrl;
	}

	webhookUrl(): string | null {
		return this.config.publicApiUrl
			? `${this.config.publicApiUrl}/api/v1/webhooks/paystack`
			: null;
	}

	createPlan(input: {
		name: string;
		interval: 'monthly' | 'annually';
		amount: number;
	}): Promise<{ plan_code: string }> {
		return this.request('POST', '/plan', { ...input, currency: 'NGN' });
	}

	/** With a plan code, Paystack charges the plan's amount and subscribes the customer. */
	initialize(input: {
		email: string;
		amount: number;
		plan: string;
		reference: string;
		callbackUrl: string;
		metadata: Record<string, string>;
	}): Promise<PaystackInitialized> {
		return this.request('POST', '/transaction/initialize', {
			email: input.email,
			amount: input.amount,
			plan: input.plan,
			reference: input.reference,
			callback_url: input.callbackUrl,
			metadata: { ...input.metadata, cancel_action: CANCEL_URL },
		});
	}

	verify(reference: string): Promise<PaystackTransaction> {
		return this.request(
			'GET',
			`/transaction/verify/${encodeURIComponent(reference)}`,
		);
	}

	/** Charges a saved card again, for a failed renewal. Settles by webhook like any charge. */
	chargeAuthorization(input: {
		authorizationCode: string;
		email: string;
		amount: number;
		reference: string;
		metadata: Record<string, string>;
	}): Promise<PaystackTransaction> {
		return this.request('POST', '/transaction/charge_authorization', {
			authorization_code: input.authorizationCode,
			email: input.email,
			amount: input.amount,
			reference: input.reference,
			metadata: input.metadata,
		});
	}

	/** Full refund of one transaction. Paystack settles it to the payer over a few days. */
	refund(reference: string): Promise<unknown> {
		return this.request('POST', '/refund', { transaction: reference });
	}

	/** Stops future charges; the current period stays paid. */
	disableSubscription(code: string, token: string): Promise<unknown> {
		return this.request('POST', '/subscription/disable', { code, token });
	}

	/** A customer's subscriptions; the plan comes back empty here, so fetch one for it. */
	async customerSubscriptions(
		customerCode: string,
	): Promise<PaystackSubscription[]> {
		const customer = await this.request<{
			subscriptions?: PaystackSubscription[];
		}>('GET', `/customer/${encodeURIComponent(customerCode)}`);

		return customer.subscriptions ?? [];
	}

	fetchSubscription(code: string): Promise<PaystackSubscription> {
		return this.request('GET', `/subscription/${encodeURIComponent(code)}`);
	}

	/**
	 * Paystack signs the raw body with HMAC SHA512 under the secret key.
	 * Compared in constant time so the check leaks nothing about the key.
	 * https://paystack.com/docs/payments/webhooks/#verify-event-origin
	 */
	isValidSignature(rawBody: Buffer, signature: string | undefined): boolean {
		if (!this.config.paystackSecretKey || !signature) return false;

		const expected = createHmac('sha512', this.config.paystackSecretKey)
			.update(rawBody)
			.digest('hex');
		const given = Buffer.from(signature, 'utf8');
		const wanted = Buffer.from(expected, 'utf8');

		return given.length === wanted.length && timingSafeEqual(given, wanted);
	}

	private async request<T>(
		method: 'GET' | 'POST',
		path: string,
		body?: unknown,
	): Promise<T> {
		if (!this.config.paystackSecretKey) {
			throw new ServiceUnavailableException({
				code: 'PAYMENTS_NOT_CONFIGURED',
				message: 'Payments are not available yet.',
			});
		}

		let response: Response;

		try {
			response = await fetch(`${API_URL}${path}`, {
				method,
				headers: {
					Authorization: `Bearer ${this.config.paystackSecretKey}`,
					'Content-Type': 'application/json',
				},
				body: body ? JSON.stringify(body) : undefined,
				signal: AbortSignal.timeout(TIMEOUT_MS),
			});
		} catch {
			throw this.unreachable();
		}

		const payload = (await response
			.json()
			.catch(() => null)) as Envelope<T> | null;

		if (!response.ok || !payload?.status) {
			throw new BadGatewayException({
				code: 'PAYMENT_PROVIDER_ERROR',
				message:
					payload?.message ??
					'Paystack could not process the request.',
			});
		}

		return payload.data;
	}

	private unreachable(): ServiceUnavailableException {
		return new ServiceUnavailableException({
			code: 'PAYMENT_PROVIDER_UNREACHABLE',
			message:
				'We could not reach the payment provider. Try again in a moment.',
		});
	}
}
