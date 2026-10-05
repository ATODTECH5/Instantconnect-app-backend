import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import { PageInfoDto } from '../common/dto/pagination.dto';
import { csvLine, escapeLike } from '../common/utils/csv.util';
import { Storage } from '../storage/storage';
import {
	AdminPaymentPageDto,
	AdminPlanDto,
	type AdminSubscriberDto,
	AdminSubscriberPageDto,
	type AdminSubscriptionDetailDto,
	type AdminSubscriptionFiltersDto,
	AdminSubscriptionStatsDto,
	AdminSubscriptionTab,
	type ListAdminPaymentsQueryDto,
	type ListAdminSubscriptionsQueryDto,
	PaymentSettingsDto,
	type SubscriptionPaymentDto,
	SubscriptionWindow,
	type UpdatePlanDto,
} from '../subscriptions/dto/subscription.dto';
import { PaymentStatus } from '../subscriptions/entities/payment.entity';
import { SubscriptionPlan } from '../subscriptions/entities/subscription-plan.entity';
import {
	type BillingCycle,
	LIVE_STATUSES,
	Subscription,
	SubscriptionStatus,
} from '../subscriptions/entities/subscription.entity';
import { PaystackClient } from '../subscriptions/paystack.client';

const LIVE_SQL = `('active', 'non_renewing', 'past_due')`;

const MONTH_START = `(date_trunc('month', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos')`;

export const MAX_EXPORT_ROWS = 5000;

const TAB_STATUSES: Record<AdminSubscriptionTab, SubscriptionStatus[]> = {
	[AdminSubscriptionTab.Active]: [SubscriptionStatus.Active],
	[AdminSubscriptionTab.Expired]: [SubscriptionStatus.Expired],
	[AdminSubscriptionTab.Failed]: [SubscriptionStatus.PastDue],
	[AdminSubscriptionTab.Cancelled]: [
		SubscriptionStatus.Cancelled,
		SubscriptionStatus.NonRenewing,
	],
};

const WINDOW_INTERVALS: Record<SubscriptionWindow, string> = {
	[SubscriptionWindow.Last7Days]: '7 days',
	[SubscriptionWindow.Last30Days]: '30 days',
	[SubscriptionWindow.Last90Days]: '90 days',
	[SubscriptionWindow.Last12Months]: '12 months',
};

/** The latest successful charge supplies the payment method columns. */
const SUBSCRIBER_COLUMNS = `
  s."id", u."id" AS "userId", u."fullName", u."email", ph."storageId" AS "avatar",
  p."id" AS "planId", p."name" AS "planName", s."cycle", s."status",
  CASE WHEN s."cycle" = 'monthly' THEN p."monthlyPriceMinor" ELSE p."annualPriceMinor" END AS "amountMinor",
  s."createdAt" AS "startedAt", s."currentPeriodEnd",
  (s."paystackAuthorizationCode" IS NOT NULL) AS "hasAuthorization",
  lp."channel", lp."cardBrand", lp."cardLast4", lp."cardExpiry", lp."bank"
`;

const SUBSCRIBER_FROM = `
  FROM "subscriptions" s
  JOIN "users" u ON u."id" = s."userId"
  JOIN "subscription_plans" p ON p."id" = s."planId"
  LEFT JOIN "user_photos" ph ON ph."userId" = u."id" AND ph."position" = 0
  LEFT JOIN LATERAL (
    SELECT x."channel", x."cardBrand", x."cardLast4", x."cardExpiry", x."bank"
      FROM "payments" x
     WHERE x."subscriptionId" = s."id" AND x."status" IN ('success', 'refunded')
     ORDER BY x."paidAt" DESC NULLS LAST LIMIT 1
  ) lp ON TRUE
`;

type SubscriberRecord = {
	id: string;
	userId: string;
	fullName: string;
	email: string;
	avatar: string | null;
	planId: string;
	planName: string;
	cycle: BillingCycle;
	status: SubscriptionStatus;
	amountMinor: number;
	startedAt: Date;
	currentPeriodEnd: Date;
	hasAuthorization: boolean;
	channel: string | null;
	cardBrand: string | null;
	cardLast4: string | null;
	cardExpiry: string | null;
	bank: string | null;
};

/** "Visa 4532", "GTBank transfer", for the CSV. */
function describeMethod(row: SubscriberRecord): string {
	if (row.cardLast4) return `${row.cardBrand ?? 'Card'} ${row.cardLast4}`;
	if (row.bank) return `${row.bank} ${row.channel ?? ''}`.trim();

	return row.channel ?? '';
}

@Injectable()
export class AdminSubscriptionsService {
	constructor(
		@InjectRepository(SubscriptionPlan)
		private readonly plans: Repository<SubscriptionPlan>,
		@InjectRepository(Subscription)
		private readonly subscriptions: Repository<Subscription>,
		private readonly dataSource: DataSource,
		private readonly storage: Storage,
		private readonly paystack: PaystackClient,
	) {}

	async stats(): Promise<AdminSubscriptionStatsDto> {
		const [row] = await this.dataSource.query<AdminSubscriptionStatsDto[]>(`
      SELECT
        (SELECT count(DISTINCT "userId") FROM "subscriptions")::int AS "totalSubscribers",
        (SELECT count(*) FROM "subscriptions" WHERE "createdAt" >= ${MONTH_START})::int AS "newThisMonth",
        (SELECT count(*) FROM "subscriptions" WHERE "status" IN ${LIVE_SQL})::int AS "activeSubscriptions",
        COALESCE((SELECT sum(CASE WHEN s."cycle" = 'monthly' THEN p."monthlyPriceMinor" ELSE p."annualPriceMinor" / 12 END)
          FROM "subscriptions" s JOIN "subscription_plans" p ON p."id" = s."planId"
          WHERE s."status" IN ('active', 'past_due')), 0)::int AS "monthlyRecurringMinor",
        COALESCE((SELECT sum("amountMinor") FROM "payments" WHERE "status" = 'success'
          AND "paidAt" >= ${MONTH_START}), 0)::int AS "revenueThisMonthMinor",
        COALESCE((SELECT sum("amountMinor") FROM "payments" WHERE "status" = 'success'
          AND "paidAt" >= ${MONTH_START} - interval '1 month' AND "paidAt" < ${MONTH_START}), 0)::int AS "revenueLastMonthMinor",
        (SELECT count(*) FROM "payments" WHERE "status" = 'failed'
          AND "createdAt" > now() - interval '30 days')::int AS "failedPayments"
    `);

		return row;
	}

	async subscribers(
		query: ListAdminSubscriptionsQueryDto,
	): Promise<AdminSubscriberPageDto> {
		const params: unknown[] = [];
		const where = this.whereFor(query, params);
		const [rows, [{ total }]] = await Promise.all([
			this.dataSource.query<SubscriberRecord[]>(
				`SELECT ${SUBSCRIBER_COLUMNS} ${SUBSCRIBER_FROM} WHERE ${where}
         ORDER BY s."createdAt" DESC, s."id"
         LIMIT ${query.limit} OFFSET ${query.offset}`,
				params,
			),
			this.dataSource.query<{ total: number }[]>(
				`SELECT count(*)::int AS "total" ${SUBSCRIBER_FROM} WHERE ${where}`,
				params,
			),
		]);

		return {
			items: rows.map((row) => this.toSubscriber(row)),
			page: new PageInfoDto(total, query),
		};
	}

	async findOne(id: string): Promise<AdminSubscriptionDetailDto> {
		const [[row], payments] = await Promise.all([
			this.dataSource.query<
				(SubscriberRecord & {
					phone: string | null;
					memberSince: Date;
					totalPaidMinor: number;
					paidPeriods: number;
				})[]
			>(
				`SELECT ${SUBSCRIBER_COLUMNS}, u."phone", u."createdAt" AS "memberSince",
           COALESCE((SELECT sum(x."amountMinor") FROM "payments" x
             WHERE x."subscriptionId" = s."id" AND x."status" = 'success'), 0)::int AS "totalPaidMinor",
           (SELECT count(*) FROM "payments" x
             WHERE x."subscriptionId" = s."id" AND x."status" = 'success')::int AS "paidPeriods"
         ${SUBSCRIBER_FROM} WHERE s."id" = $1`,
				[id],
			),
			this.dataSource.query<SubscriptionPaymentDto[]>(
				`SELECT "id", "reference", "amountMinor", "status", "failureReason", "createdAt", "paidAt"
           FROM "payments" WHERE "subscriptionId" = $1
          ORDER BY "createdAt" DESC LIMIT 12`,
				[id],
			),
		]);

		if (!row) {
			throw new NotFoundException({
				code: 'SUBSCRIPTION_NOT_FOUND',
				message: 'That subscription no longer exists.',
			});
		}

		return {
			...this.toSubscriber(row),
			phone: row.phone,
			memberSince: row.memberSince,
			cancelAtPeriodEnd: row.status === SubscriptionStatus.NonRenewing,
			totalPaidMinor: row.totalPaidMinor,
			paidPeriods: row.paidPeriods,
			payments,
			canRefund: payments.some(
				(payment) => payment.status === PaymentStatus.Success,
			),
		};
	}

	/** Every subscription matching the filters, newest first, capped at MAX_EXPORT_ROWS. */
	async exportCsv(filters: AdminSubscriptionFiltersDto): Promise<string> {
		const params: unknown[] = [];
		const where = this.whereFor(filters, params);
		const rows = await this.dataSource.query<SubscriberRecord[]>(
			`SELECT ${SUBSCRIBER_COLUMNS} ${SUBSCRIBER_FROM} WHERE ${where}
       ORDER BY s."createdAt" DESC LIMIT ${MAX_EXPORT_ROWS}`,
			params,
		);

		return [
			csvLine([
				'Member',
				'Email',
				'Plan',
				'Cycle',
				'Amount (NGN)',
				'Payment method',
				'Started',
				'Next billing',
				'Status',
			]),
			...rows.map((row) =>
				csvLine([
					row.fullName,
					row.email,
					row.planName,
					row.cycle,
					row.amountMinor / 100,
					describeMethod(row),
					new Date(row.startedAt).toISOString(),
					new Date(row.currentPeriodEnd).toISOString(),
					row.status,
				]),
			),
		].join('');
	}

	private whereFor(
		filters: AdminSubscriptionFiltersDto,
		params: unknown[],
	): string {
		const bind = (value: unknown) => {
			params.push(value);
			return `$${params.length}`;
		};
		const clauses = ['TRUE'];

		if (filters.status) {
			clauses.push(
				`s."status" = ANY(${bind(TAB_STATUSES[filters.status])}::subscriptions_status_enum[])`,
			);
		}
		if (filters.planId)
			clauses.push(`s."planId" = ${bind(filters.planId)}`);
		if (filters.window) {
			clauses.push(
				`s."createdAt" >= now() - ${bind(WINDOW_INTERVALS[filters.window])}::interval`,
			);
		}
		if (filters.search) {
			const pattern = bind(`%${escapeLike(filters.search)}%`);
			clauses.push(
				`(u."fullName" ILIKE ${pattern} OR u."email" ILIKE ${pattern})`,
			);
		}

		return clauses.join(' AND ');
	}

	private toSubscriber(row: SubscriberRecord): AdminSubscriberDto {
		const hasMethod = Boolean(row.channel || row.cardLast4 || row.bank);

		return {
			id: row.id,
			userId: row.userId,
			fullName: row.fullName,
			email: row.email,
			avatarUrl: row.avatar
				? this.storage.buildUrl(row.avatar, 'thumbnail')
				: null,
			planId: row.planId,
			planName: row.planName,
			cycle: row.cycle,
			amountMinor: row.amountMinor,
			paymentMethod: hasMethod
				? {
						channel: row.channel,
						cardBrand: row.cardBrand,
						cardLast4: row.cardLast4,
						cardExpiry: row.cardExpiry,
						bank: row.bank,
					}
				: null,
			status: row.status,
			startedAt: row.startedAt,
			currentPeriodEnd: row.currentPeriodEnd,
			canRetry:
				row.status === SubscriptionStatus.PastDue &&
				row.hasAuthorization,
		};
	}

	async payments(
		query: ListAdminPaymentsQueryDto,
	): Promise<AdminPaymentPageDto> {
		const params: unknown[] = [];
		const filters: string[] = ['TRUE'];

		if (query.status) {
			params.push(query.status);
			filters.push(`pay."status" = $${params.length}`);
		}

		if (query.search) {
			params.push(`%${escapeLike(query.search)}%`);
			const n = params.length;
			filters.push(
				`(u."fullName" ILIKE $${n} OR u."email" ILIKE $${n} OR pay."reference" ILIKE $${n})`,
			);
		}

		const from = `
      FROM "payments" pay
      JOIN "users" u ON u."id" = pay."userId"
      JOIN "subscription_plans" p ON p."id" = pay."planId"
      WHERE ${filters.join(' AND ')}`;
		const [items, [{ total }]] = await Promise.all([
			this.dataSource.query<AdminPaymentPageDto['items']>(
				`SELECT pay."id", pay."reference", u."id" AS "userId", u."fullName", u."email",
           p."name" AS "planName", pay."cycle", pay."amountMinor", pay."status", pay."channel",
           pay."failureReason", pay."paidAt", pay."createdAt"
         ${from}
         ORDER BY pay."createdAt" DESC, pay."id"
         LIMIT ${query.limit} OFFSET ${query.offset}`,
				params,
			),
			this.dataSource.query<{ total: number }[]>(
				`SELECT count(*)::int AS "total" ${from}`,
				params,
			),
		]);

		return { items, page: new PageInfoDto(total, query) };
	}

	async listPlans(): Promise<AdminPlanDto[]> {
		const [rows, counts] = await Promise.all([
			this.plans.find({
				relations: { updatedBy: true },
				order: { sortOrder: 'ASC' },
			}),
			this.subscriptions
				.createQueryBuilder('subscription')
				.select('subscription.planId', 'planId')
				.addSelect('COUNT(*)', 'count')
				.where({ status: In(LIVE_STATUSES) })
				.groupBy('subscription.planId')
				.getRawMany<{ planId: string; count: string }>(),
		]);
		const countById = new Map(
			counts.map((row) => [row.planId, Number(row.count)]),
		);

		return rows.map(
			(row) => new AdminPlanDto(row, countById.get(row.id) ?? 0),
		);
	}

	/**
	 * A new price clears that cycle's Paystack plan code, so the next checkout
	 * mints a plan at the new amount. Existing subscribers stay on the code
	 * they signed up with, and so on the price they agreed to.
	 */
	async updatePlan(
		adminId: string,
		id: string,
		changes: UpdatePlanDto,
	): Promise<AdminPlanDto> {
		const plan = await this.plans.findOne({ where: { id } });

		if (!plan) {
			throw new NotFoundException({
				code: 'PLAN_NOT_FOUND',
				message: 'That plan does not exist.',
			});
		}

		const monthlyChanged =
			changes.monthlyPriceMinor !== undefined &&
			changes.monthlyPriceMinor !== plan.monthlyPriceMinor;
		const annualChanged =
			changes.annualPriceMinor !== undefined &&
			changes.annualPriceMinor !== plan.annualPriceMinor;

		await this.plans.update(id, {
			...changes,
			...(monthlyChanged ? { paystackMonthlyPlanCode: null } : {}),
			...(annualChanged ? { paystackAnnualPlanCode: null } : {}),
			updatedById: adminId,
		});

		const plans = await this.listPlans();

		return plans.find((row) => row.id === id) as AdminPlanDto;
	}

	settings(): PaymentSettingsDto {
		return {
			configured: this.paystack.isConfigured,
			testMode: this.paystack.isTestMode,
			webhookUrl: this.paystack.webhookUrl(),
			callbackUrl: this.paystack.callbackUrl,
			currency: 'NGN',
		};
	}
}
