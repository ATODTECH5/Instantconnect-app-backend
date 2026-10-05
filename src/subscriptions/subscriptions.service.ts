import { randomUUID } from 'node:crypto';

import {
	ConflictException,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import {
	DataSource,
	type EntityManager,
	In,
	LessThan,
	Repository,
} from 'typeorm';

import { User } from '../users/entities/user.entity';
import {
	CheckoutResponseDto,
	CheckoutResultDto,
	MySubscriptionDto,
	PlanDto,
} from './dto/subscription.dto';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import {
	BillingCycle,
	LIVE_STATUSES,
	Subscription,
	SubscriptionStatus,
} from './entities/subscription.entity';
import { PaystackClient, type PaystackTransaction } from './paystack.client';

/** How long a renewal may be late before a lapsed subscription expires. */
const RENEWAL_GRACE_MS = 3 * 24 * 60 * 60 * 1000;
/** A checkout left open this long was walked away from. */
const ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000;

type PaystackEvent = {
	event: string;
	data: Record<string, unknown>;
};

type SubscriptionEventData = {
	subscription_code?: string;
	email_token?: string;
	next_payment_date?: string | null;
	customer?: { email?: string; customer_code?: string };
	plan?: { plan_code?: string };
	subscription?: { subscription_code?: string };
};

function addCycle(from: Date, cycle: BillingCycle): Date {
	const next = new Date(from);

	if (cycle === BillingCycle.Monthly) next.setMonth(next.getMonth() + 1);
	else next.setFullYear(next.getFullYear() + 1);

	return next;
}

function authorizationCodeOf(tx: PaystackTransaction): string | null {
	return tx.authorization?.reusable
		? (tx.authorization.authorization_code ?? null)
		: null;
}

/** How a charge was paid, for the admin's Payment Method column. */
function methodOf(
	tx: PaystackTransaction,
): Pick<
	Payment,
	'channel' | 'cardBrand' | 'cardLast4' | 'cardExpiry' | 'bank'
> {
	const auth = tx.authorization;
	const isCard = tx.channel === 'card' && Boolean(auth?.last4);

	return {
		channel: tx.channel,
		cardBrand: isCard
			? (auth?.card_type?.trim().toLowerCase().slice(0, 20) ?? null)
			: null,
		cardLast4: isCard ? (auth?.last4 ?? null) : null,
		cardExpiry:
			isCard && auth?.exp_month && auth.exp_year
				? `${auth.exp_month.padStart(2, '0')}/${auth.exp_year.slice(-2)}`
				: null,
		bank: auth?.bank?.slice(0, 80) ?? null,
	};
}

function planCodeOf(tx: PaystackTransaction): string | null {
	if (!tx.plan) return null;

	return typeof tx.plan === 'string' ? tx.plan : tx.plan.plan_code;
}

/**
 * Paid plans through Paystack's hosted checkout. A charge is applied the
 * same way whether the app confirms it or the webhook reports it, and
 * applying one twice changes nothing: the payment's own status is the guard.
 */
@Injectable()
export class SubscriptionsService {
	private readonly logger = new Logger(SubscriptionsService.name);

	constructor(
		@InjectRepository(SubscriptionPlan)
		private readonly plans: Repository<SubscriptionPlan>,
		@InjectRepository(Subscription)
		private readonly subscriptions: Repository<Subscription>,
		@InjectRepository(Payment)
		private readonly payments: Repository<Payment>,
		private readonly dataSource: DataSource,
		private readonly paystack: PaystackClient,
	) {}

	async listPlans(): Promise<PlanDto[]> {
		const rows = await this.plans.find({
			where: { isActive: true },
			order: { sortOrder: 'ASC' },
		});

		return rows.map((row) => new PlanDto(row));
	}

	async current(userId: string): Promise<MySubscriptionDto> {
		const live = await this.liveSubscription(userId);

		return new MySubscriptionDto({
			planId: live?.planId ?? 'free',
			cycle: live?.cycle ?? null,
			status: live?.status ?? null,
			currentPeriodEnd: live?.currentPeriodEnd ?? null,
			cancelAtPeriodEnd: live?.status === SubscriptionStatus.NonRenewing,
			paymentsEnabled: this.paystack.isConfigured,
		});
	}

	async checkout(
		userId: string,
		planId: string,
		cycle: BillingCycle,
	): Promise<CheckoutResponseDto> {
		const plan = await this.plans.findOne({
			where: { id: planId, isActive: true },
		});

		if (!plan) {
			throw new NotFoundException({
				code: 'PLAN_NOT_FOUND',
				message: 'That plan is not available.',
			});
		}

		const live = await this.liveSubscription(userId);

		if (
			live &&
			live.planId === planId &&
			live.cycle === cycle &&
			live.status === SubscriptionStatus.Active
		) {
			throw new ConflictException({
				code: 'ALREADY_SUBSCRIBED',
				message: 'You are already on this plan.',
			});
		}

		const user = await this.dataSource.getRepository(User).findOneOrFail({
			where: { id: userId },
			select: { id: true, email: true },
		});
		const planCode = await this.ensurePlanCode(plan, cycle);
		const reference = `ic_${randomUUID().replace(/-/g, '')}`;
		const amountMinor =
			cycle === BillingCycle.Monthly
				? plan.monthlyPriceMinor
				: plan.annualPriceMinor;

		await this.payments.save(
			this.payments.create({
				userId,
				planId,
				cycle,
				reference,
				amountMinor,
			}),
		);

		const session = await this.paystack.initialize({
			email: user.email,
			amount: amountMinor,
			plan: planCode,
			reference,
			callbackUrl: this.paystack.callbackUrl,
			metadata: { userId, planId, cycle },
		});

		return new CheckoutResponseDto(
			session.authorization_url,
			reference,
			this.paystack.callbackUrl,
		);
	}

	/** What the app calls when the checkout page closes; also safe to call again. */
	async confirm(
		userId: string,
		reference: string,
	): Promise<CheckoutResultDto> {
		const payment = await this.payments.findOne({
			where: { reference, userId },
		});

		if (!payment) {
			throw new NotFoundException({
				code: 'PAYMENT_NOT_FOUND',
				message: 'We could not find that payment.',
			});
		}

		if (payment.status === PaymentStatus.Pending) {
			await this.applyCharge(await this.paystack.verify(reference));
		}

		const settled = await this.payments.findOneOrFail({
			where: { id: payment.id },
		});

		return new CheckoutResultDto(
			settled.status,
			settled.failureReason,
			await this.current(userId),
		);
	}

	/**
	 * Stops renewals at Paystack and keeps the plan until the paid period
	 * ends. The codes this needs normally arrive by webhook; when that was
	 * lost, they are fetched from Paystack first.
	 */
	async cancel(userId: string): Promise<MySubscriptionDto> {
		const found = await this.liveSubscription(userId);

		if (!found || found.status === SubscriptionStatus.NonRenewing) {
			return this.current(userId);
		}

		const live = await this.withPaystackCodes(found);

		if (!live.paystackSubscriptionCode || !live.paystackEmailToken) {
			throw new ConflictException({
				code: 'SUBSCRIPTION_NOT_READY',
				message:
					'Your subscription is still being set up. Try again in a minute.',
			});
		}

		await this.paystack.disableSubscription(
			live.paystackSubscriptionCode,
			live.paystackEmailToken,
		);
		await this.subscriptions.update(live.id, {
			status: SubscriptionStatus.NonRenewing,
			cancelledAt: new Date(),
		});

		return this.current(userId);
	}

	/** Already signature checked. Unknown events are acknowledged and ignored. */
	async handleWebhook(event: PaystackEvent): Promise<void> {
		const data = event.data as SubscriptionEventData;

		switch (event.event) {
			case 'charge.success':
				await this.applyCharge(
					event.data as unknown as PaystackTransaction,
				);
				break;
			case 'subscription.create':
				await this.attachPaystackSubscription(data);
				break;
			case 'subscription.not_renew':
				await this.setStatusByCode(
					data.subscription_code,
					SubscriptionStatus.NonRenewing,
				);
				break;
			case 'subscription.disable':
				await this.disableByCode(data.subscription_code);
				break;
			case 'invoice.payment_failed':
				await this.setStatusByCode(
					data.subscription?.subscription_code,
					SubscriptionStatus.PastDue,
				);
				break;
			default:
				break;
		}
	}

	/** Lapsed plans end, and checkouts nobody finished are written off. */
	@Cron(CronExpression.EVERY_HOUR)
	async expireLapsed(): Promise<void> {
		try {
			const now = Date.now();

			await this.subscriptions.update(
				{
					status: SubscriptionStatus.NonRenewing,
					currentPeriodEnd: LessThan(new Date(now)),
				},
				{ status: SubscriptionStatus.Expired },
			);
			await this.subscriptions.update(
				{
					status: In([
						SubscriptionStatus.Active,
						SubscriptionStatus.PastDue,
					]),
					currentPeriodEnd: LessThan(
						new Date(now - RENEWAL_GRACE_MS),
					),
				},
				{ status: SubscriptionStatus.Expired },
			);
			await this.payments.update(
				{
					status: PaymentStatus.Pending,
					createdAt: LessThan(new Date(now - ABANDONED_AFTER_MS)),
				},
				{ status: PaymentStatus.Abandoned },
			);
		} catch (error) {
			this.logger.error(
				`Could not expire lapsed subscriptions: ${String(error)}`,
			);
		}
	}

	/**
	 * The one path a charge takes into the database. A first checkout has a
	 * pending payment under its reference; a renewal does not, and is matched
	 * to the member's live subscription by email and plan code instead.
	 */
	private async applyCharge(tx: PaystackTransaction): Promise<void> {
		const planChanges: Subscription[] = [];

		await this.dataSource.transaction(async (manager) => {
			const payment = await manager
				.getRepository(Payment)
				.createQueryBuilder('payment')
				.setLock('pessimistic_write')
				.where('payment.reference = :reference', {
					reference: tx.reference,
				})
				.getOne();

			if (!payment) {
				await this.applyRenewal(manager, tx);
				return;
			}

			if (payment.status === PaymentStatus.Success) return;

			if (tx.status !== 'success') {
				if (tx.status === 'failed' || tx.status === 'abandoned') {
					await manager.update(Payment, payment.id, {
						status:
							tx.status === 'failed'
								? PaymentStatus.Failed
								: PaymentStatus.Abandoned,
						failureReason:
							tx.gateway_response?.slice(0, 255) ?? null,
					});
				}
				return;
			}

			if (
				tx.amount < payment.amountMinor ||
				tx.currency !== payment.currency
			) {
				await manager.update(Payment, payment.id, {
					status: PaymentStatus.Failed,
					failureReason: `Paid ${tx.amount} ${tx.currency}, expected ${payment.amountMinor} ${payment.currency}`,
				});
				this.logger.warn(
					`Payment ${tx.reference} did not cover the plan`,
				);
				return;
			}

			const paidAt = tx.paid_at ? new Date(tx.paid_at) : new Date();
			const subscriptions = manager.getRepository(Subscription);

			// A retry belongs to the subscription it was made for: it renews
			// that one rather than starting a new plan.
			if (payment.subscriptionId) {
				const retried = await subscriptions.findOneOrFail({
					where: { id: payment.subscriptionId },
				});

				await subscriptions.update(retried.id, {
					status: SubscriptionStatus.Active,
					currentPeriodEnd: addCycle(
						retried.currentPeriodEnd > paidAt
							? retried.currentPeriodEnd
							: paidAt,
						retried.cycle,
					),
					paystackAuthorizationCode:
						authorizationCodeOf(tx) ??
						retried.paystackAuthorizationCode,
				});
				await manager.update(Payment, payment.id, {
					status: PaymentStatus.Success,
					paidAt,
					failureReason: null,
					...methodOf(tx),
				});
				return;
			}

			const live = await subscriptions.findOne({
				where: { userId: payment.userId, status: In(LIVE_STATUSES) },
			});

			if (live) {
				await subscriptions.update(live.id, {
					status: SubscriptionStatus.Cancelled,
					cancelledAt: paidAt,
				});
				planChanges.push(live);
			}

			const saved = await subscriptions.save(
				subscriptions.create({
					userId: payment.userId,
					planId: payment.planId,
					cycle: payment.cycle,
					status: SubscriptionStatus.Active,
					currentPeriodEnd: addCycle(paidAt, payment.cycle),
					paystackCustomerCode: tx.customer?.customer_code ?? null,
					paystackPlanCode: planCodeOf(tx),
					paystackAuthorizationCode: authorizationCodeOf(tx),
				}),
			);

			await manager.update(Payment, payment.id, {
				status: PaymentStatus.Success,
				subscriptionId: saved.id,
				paidAt,
				failureReason: null,
				...methodOf(tx),
			});
		});

		// Outside the transaction: Paystack must stop charging for the plan
		// that was replaced, and a slow call must not hold row locks.
		for (const replaced of planChanges) {
			if (
				!replaced.paystackSubscriptionCode ||
				!replaced.paystackEmailToken
			)
				continue;

			try {
				await this.paystack.disableSubscription(
					replaced.paystackSubscriptionCode,
					replaced.paystackEmailToken,
				);
			} catch (error) {
				this.logger.error(
					`Could not stop renewals of replaced subscription ${replaced.id}: ${String(error)}`,
				);
			}
		}
	}

	private async applyRenewal(
		manager: EntityManager,
		tx: PaystackTransaction,
	): Promise<void> {
		const planCode = planCodeOf(tx);

		if (tx.status !== 'success' || !planCode || !tx.customer?.email) {
			this.logger.warn(
				`Ignoring charge ${tx.reference}: no checkout and no plan to renew`,
			);
			return;
		}

		const live = await manager
			.getRepository(Subscription)
			.createQueryBuilder('subscription')
			.innerJoin('subscription.user', 'user')
			.where('subscription.paystackPlanCode = :planCode', { planCode })
			.andWhere('lower(user.email) = lower(:email)', {
				email: tx.customer.email,
			})
			.andWhere('subscription.status IN (:...live)', {
				live: LIVE_STATUSES,
			})
			.getOne();

		if (!live) {
			this.logger.warn(
				`Renewal ${tx.reference} matched no live subscription`,
			);
			return;
		}

		const paidAt = tx.paid_at ? new Date(tx.paid_at) : new Date();
		const from =
			live.currentPeriodEnd > paidAt ? live.currentPeriodEnd : paidAt;

		await manager
			.createQueryBuilder()
			.insert()
			.into(Payment)
			.values({
				userId: live.userId,
				subscriptionId: live.id,
				planId: live.planId,
				cycle: live.cycle,
				reference: tx.reference,
				amountMinor: tx.amount,
				currency: tx.currency,
				status: PaymentStatus.Success,
				paidAt,
				...methodOf(tx),
			})
			.orIgnore()
			.execute();
		await manager.update(Subscription, live.id, {
			status:
				live.status === SubscriptionStatus.NonRenewing
					? SubscriptionStatus.NonRenewing
					: SubscriptionStatus.Active,
			currentPeriodEnd: addCycle(from, live.cycle),
			paystackAuthorizationCode:
				authorizationCodeOf(tx) ?? live.paystackAuthorizationCode,
		});
	}

	/**
	 * subscription.create can reach the API before the charge that creates
	 * the row; it then matches nothing and Paystack does not resend it. This
	 * recovers the codes from the customer's subscriptions on that plan.
	 */
	private async withPaystackCodes(live: Subscription): Promise<Subscription> {
		if (live.paystackSubscriptionCode && live.paystackEmailToken)
			return live;
		if (!live.paystackCustomerCode || !live.paystackPlanCode) return live;

		const candidates = (
			await this.paystack.customerSubscriptions(live.paystackCustomerCode)
		).filter((sub) => sub.status === 'active' && sub.email_token);

		for (const candidate of candidates) {
			const full = await this.paystack.fetchSubscription(
				candidate.subscription_code,
			);

			if (full.plan?.plan_code !== live.paystackPlanCode) continue;

			const codes = {
				paystackSubscriptionCode: candidate.subscription_code,
				paystackEmailToken: candidate.email_token,
			};
			await this.subscriptions.update(live.id, codes);

			return Object.assign(live, codes);
		}

		return live;
	}

	private async attachPaystackSubscription(
		data: SubscriptionEventData,
	): Promise<void> {
		const email = data.customer?.email;
		const planCode = data.plan?.plan_code;

		if (!data.subscription_code || !email || !planCode) return;

		const live = await this.subscriptions
			.createQueryBuilder('subscription')
			.innerJoin('subscription.user', 'user')
			.where('subscription.paystackPlanCode = :planCode', { planCode })
			.andWhere('lower(user.email) = lower(:email)', { email })
			.andWhere('subscription.status IN (:...live)', {
				live: LIVE_STATUSES,
			})
			.getOne();

		if (!live) {
			this.logger.warn(
				`subscription.create ${data.subscription_code} matched no live subscription`,
			);
			return;
		}

		await this.subscriptions.update(live.id, {
			paystackSubscriptionCode: data.subscription_code,
			paystackEmailToken: data.email_token ?? null,
			paystackCustomerCode:
				data.customer?.customer_code ?? live.paystackCustomerCode,
		});
	}

	private async setStatusByCode(
		code: string | undefined,
		status: SubscriptionStatus,
	): Promise<void> {
		if (!code) return;

		await this.subscriptions.update(
			{ paystackSubscriptionCode: code, status: In(LIVE_STATUSES) },
			{ status },
		);
	}

	/** Disabled at Paystack: keep what is paid for, end it if nothing is. */
	private async disableByCode(code: string | undefined): Promise<void> {
		if (!code) return;

		const row = await this.subscriptions.findOne({
			where: {
				paystackSubscriptionCode: code,
				status: In(LIVE_STATUSES),
			},
		});

		if (!row) return;

		await this.subscriptions.update(row.id, {
			status:
				row.currentPeriodEnd > new Date()
					? SubscriptionStatus.NonRenewing
					: SubscriptionStatus.Expired,
			cancelledAt: row.cancelledAt ?? new Date(),
		});
	}

	/**
	 * Paystack plans fix their amount, so one is minted per plan and cycle at
	 * the current price, and a price change clears the codes to mint afresh.
	 */
	private async ensurePlanCode(
		plan: SubscriptionPlan,
		cycle: BillingCycle,
	): Promise<string> {
		const monthly = cycle === BillingCycle.Monthly;
		const existing = monthly
			? plan.paystackMonthlyPlanCode
			: plan.paystackAnnualPlanCode;

		if (existing) return existing;

		const created = await this.paystack.createPlan({
			name: `${plan.name} (${monthly ? 'Monthly' : 'Annual'})`,
			interval: monthly ? 'monthly' : 'annually',
			amount: monthly ? plan.monthlyPriceMinor : plan.annualPriceMinor,
		});

		await this.plans.update(
			plan.id,
			monthly
				? { paystackMonthlyPlanCode: created.plan_code }
				: { paystackAnnualPlanCode: created.plan_code },
		);

		return created.plan_code;
	}

	/**
	 * Charges the member's saved card for a renewal that failed. The charge
	 * settles through the webhook like any other; this only starts it.
	 */
	async retry(subscriptionId: string): Promise<void> {
		const subscription = await this.subscriptions.findOne({
			where: { id: subscriptionId },
			relations: { user: true, plan: true },
		});

		if (!subscription) throw this.subscriptionNotFound();

		if (subscription.status !== SubscriptionStatus.PastDue) {
			throw new ConflictException({
				code: 'SUBSCRIPTION_NOT_FAILED',
				message:
					'Only a subscription with a failed renewal can be retried.',
			});
		}

		if (!subscription.paystackAuthorizationCode) {
			throw new ConflictException({
				code: 'NO_SAVED_CARD',
				message:
					'There is no saved card to charge. The member has to pay again in the app.',
			});
		}

		const reference = `ic_${randomUUID().replace(/-/g, '')}`;
		const amountMinor =
			subscription.cycle === BillingCycle.Monthly
				? subscription.plan.monthlyPriceMinor
				: subscription.plan.annualPriceMinor;

		await this.payments.save(
			this.payments.create({
				userId: subscription.userId,
				subscriptionId: subscription.id,
				planId: subscription.planId,
				cycle: subscription.cycle,
				reference,
				amountMinor,
			}),
		);

		const tx = await this.paystack.chargeAuthorization({
			authorizationCode: subscription.paystackAuthorizationCode,
			email: subscription.user.email,
			amount: amountMinor,
			reference,
			metadata: {
				userId: subscription.userId,
				subscriptionId: subscription.id,
			},
		});

		await this.applyCharge(tx);
	}

	/** Refunds the member's latest successful charge in full. The plan is left as it is. */
	async refundLast(subscriptionId: string): Promise<void> {
		const payment = await this.payments.findOne({
			where: { subscriptionId, status: PaymentStatus.Success },
			order: { paidAt: 'DESC' },
		});

		if (!payment) {
			throw new NotFoundException({
				code: 'PAYMENT_NOT_FOUND',
				message: 'There is no successful payment to refund.',
			});
		}

		await this.paystack.refund(payment.reference);
		await this.payments.update(payment.id, {
			status: PaymentStatus.Refunded,
			refundedAt: new Date(),
		});
	}

	private subscriptionNotFound(): NotFoundException {
		return new NotFoundException({
			code: 'SUBSCRIPTION_NOT_FOUND',
			message: 'That subscription no longer exists.',
		});
	}

	private liveSubscription(userId: string): Promise<Subscription | null> {
		return this.subscriptions.findOne({
			where: { userId, status: In(LIVE_STATUSES) },
		});
	}
}
