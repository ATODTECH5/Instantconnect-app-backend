import {
	ApiProperty,
	ApiPropertyOptional,
	IntersectionType,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	ArrayMaxSize,
	IsArray,
	IsBoolean,
	IsEnum,
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsString,
	Max,
	MaxLength,
	Min,
} from 'class-validator';

import {
	PageInfoDto,
	PaginationQueryDto,
} from '../../common/dto/pagination.dto';
import { PaymentStatus } from '../entities/payment.entity';
import type { SubscriptionPlan } from '../entities/subscription-plan.entity';
import {
	BillingCycle,
	SubscriptionStatus,
} from '../entities/subscription.entity';

const trim = Transform(({ value }: { value: unknown }) =>
	typeof value === 'string' ? value.trim() : value,
);

/** ₦1,000,000 in kobo; well past any plan, and inside an int. */
const MAX_PRICE_MINOR = 100_000_000;

export class PlanDto {
	@ApiProperty({ example: 'premium' })
	id: string;

	@ApiProperty({ example: 'Premium Elite' })
	name: string;

	@ApiProperty()
	tagline: string;

	@ApiProperty()
	description: string;

	@ApiProperty({ type: [String] })
	features: string[];

	@ApiProperty({ description: 'Kobo.', example: 250000 })
	monthlyPriceMinor: number;

	@ApiProperty({
		description: 'Kobo, for a year paid at once.',
		example: 2400000,
	})
	annualPriceMinor: number;

	constructor(plan: SubscriptionPlan) {
		this.id = plan.id;
		this.name = plan.name;
		this.tagline = plan.tagline;
		this.description = plan.description;
		this.features = plan.features;
		this.monthlyPriceMinor = plan.monthlyPriceMinor;
		this.annualPriceMinor = plan.annualPriceMinor;
	}
}

export class MySubscriptionDto {
	@ApiProperty({ example: 'free', description: '"free", or a plan id.' })
	planId: string;

	@ApiPropertyOptional({
		enum: BillingCycle,
		enumName: 'BillingCycle',
		nullable: true,
	})
	cycle: BillingCycle | null;

	@ApiPropertyOptional({
		enum: SubscriptionStatus,
		enumName: 'SubscriptionStatus',
		nullable: true,
	})
	status: SubscriptionStatus | null;

	@ApiPropertyOptional({
		nullable: true,
		description: 'Paid up until. Renews then unless cancelAtPeriodEnd.',
	})
	currentPeriodEnd: Date | null;

	@ApiProperty({
		description: 'Cancelled: the plan ends at currentPeriodEnd.',
	})
	cancelAtPeriodEnd: boolean;

	@ApiProperty({
		description: 'False when Paystack is not configured on the server.',
	})
	paymentsEnabled: boolean;

	constructor(fields: MySubscriptionDto) {
		this.planId = fields.planId;
		this.cycle = fields.cycle;
		this.status = fields.status;
		this.currentPeriodEnd = fields.currentPeriodEnd;
		this.cancelAtPeriodEnd = fields.cancelAtPeriodEnd;
		this.paymentsEnabled = fields.paymentsEnabled;
	}
}

export class CheckoutDto {
	@ApiProperty({ example: 'premium' })
	@IsString()
	@IsNotEmpty()
	@MaxLength(16)
	planId!: string;

	@ApiProperty({ enum: BillingCycle, enumName: 'BillingCycle' })
	@IsEnum(BillingCycle)
	cycle!: BillingCycle;
}

export class CheckoutResponseDto {
	@ApiProperty({
		description: "Paystack's hosted checkout page. Open it in a browser.",
	})
	authorizationUrl: string;

	@ApiProperty({
		description:
			'Confirm with GET /subscriptions/checkout/:reference afterwards.',
	})
	reference: string;

	@ApiProperty({
		description: 'Paystack redirects here when the payment finishes.',
	})
	callbackUrl: string;

	constructor(
		authorizationUrl: string,
		reference: string,
		callbackUrl: string,
	) {
		this.authorizationUrl = authorizationUrl;
		this.reference = reference;
		this.callbackUrl = callbackUrl;
	}
}

export class CheckoutResultDto {
	@ApiProperty({ enum: PaymentStatus, enumName: 'PaymentStatus' })
	paymentStatus: PaymentStatus;

	@ApiPropertyOptional({
		nullable: true,
		description: 'Why it failed, in Paystack’s words.',
	})
	failureReason: string | null;

	@ApiProperty({ type: MySubscriptionDto })
	subscription: MySubscriptionDto;

	constructor(
		paymentStatus: PaymentStatus,
		failureReason: string | null,
		subscription: MySubscriptionDto,
	) {
		this.paymentStatus = paymentStatus;
		this.failureReason = failureReason;
		this.subscription = subscription;
	}
}

export class UpdatePlanDto {
	@ApiPropertyOptional({ maxLength: 60 })
	@IsOptional()
	@trim
	@IsString()
	@IsNotEmpty()
	@MaxLength(60)
	name?: string;

	@ApiPropertyOptional({ maxLength: 120 })
	@IsOptional()
	@trim
	@IsString()
	@IsNotEmpty()
	@MaxLength(120)
	tagline?: string;

	@ApiPropertyOptional({ maxLength: 300 })
	@IsOptional()
	@trim
	@IsString()
	@IsNotEmpty()
	@MaxLength(300)
	description?: string;

	@ApiPropertyOptional({ type: [String], maxItems: 12 })
	@IsOptional()
	@IsArray()
	@ArrayMaxSize(12)
	@IsString({ each: true })
	@MaxLength(80, { each: true })
	features?: string[];

	@ApiPropertyOptional({
		minimum: 10000,
		description: 'Kobo. New subscribers pay it; existing ones keep theirs.',
	})
	@IsOptional()
	@IsInt()
	@Min(10000)
	@Max(MAX_PRICE_MINOR)
	monthlyPriceMinor?: number;

	@ApiPropertyOptional({ minimum: 10000 })
	@IsOptional()
	@IsInt()
	@Min(10000)
	@Max(MAX_PRICE_MINOR)
	annualPriceMinor?: number;

	@ApiPropertyOptional({
		description: 'Off: hidden from the app; subscribers keep it.',
	})
	@IsOptional()
	@IsBoolean()
	isActive?: boolean;
}

export class AdminPlanDto extends PlanDto {
	@ApiProperty()
	isActive: boolean;

	@ApiProperty({ description: 'Live subscriptions on this plan.' })
	subscriberCount: number;

	@ApiProperty()
	updatedAt: Date;

	@ApiPropertyOptional({ nullable: true })
	updatedByName: string | null;

	constructor(plan: SubscriptionPlan, subscriberCount: number) {
		super(plan);
		this.isActive = plan.isActive;
		this.subscriberCount = subscriberCount;
		this.updatedAt = plan.updatedAt;
		this.updatedByName = plan.updatedBy?.fullName ?? null;
	}
}

export class AdminSubscriptionStatsDto {
	@ApiProperty({ description: 'Members who have ever subscribed.' })
	totalSubscribers!: number;

	@ApiProperty({
		description: 'Subscriptions started since the 1st of this month.',
	})
	newThisMonth!: number;

	@ApiProperty({ description: 'Live subscriptions, every plan.' })
	activeSubscriptions!: number;

	@ApiProperty({
		description:
			'Kobo a month: monthly prices plus a twelfth of annual ones.',
	})
	monthlyRecurringMinor!: number;

	@ApiProperty({
		description: 'Kobo collected since the 1st of this month, Lagos time.',
	})
	revenueThisMonthMinor!: number;

	@ApiProperty({
		description: 'Kobo collected last calendar month, for the comparison.',
	})
	revenueLastMonthMinor!: number;

	@ApiProperty({ description: 'In the last 30 days.' })
	failedPayments!: number;
}

/** The tabs on the admin Subscriptions page; each maps to statuses. */
export enum AdminSubscriptionTab {
	Active = 'active',
	Expired = 'expired',
	/** A renewal failed: past due. */
	Failed = 'failed',
	/** Stopped by the member, or replaced by another plan. */
	Cancelled = 'cancelled',
}

export enum SubscriptionWindow {
	Last7Days = '7d',
	Last30Days = '30d',
	Last90Days = '90d',
	Last12Months = '12m',
}

/** Shared by the table and the CSV export. */
export class AdminSubscriptionFiltersDto {
	@ApiPropertyOptional({ maxLength: 60, description: 'Name or email.' })
	@IsOptional()
	@trim
	@IsString()
	@MaxLength(60)
	search?: string;

	@ApiPropertyOptional({
		enum: AdminSubscriptionTab,
		enumName: 'AdminSubscriptionTab',
	})
	@IsOptional()
	@IsEnum(AdminSubscriptionTab)
	status?: AdminSubscriptionTab;

	@ApiPropertyOptional({ example: 'premium' })
	@IsOptional()
	@IsString()
	@MaxLength(16)
	planId?: string;

	@ApiPropertyOptional({
		enum: SubscriptionWindow,
		enumName: 'SubscriptionWindow',
		description: 'Started within.',
	})
	@IsOptional()
	@IsEnum(SubscriptionWindow)
	window?: SubscriptionWindow;
}

export class ListAdminSubscriptionsQueryDto extends IntersectionType(
	PaginationQueryDto,
	AdminSubscriptionFiltersDto,
) {}

export class PaymentMethodDto {
	@ApiPropertyOptional({ nullable: true, example: 'card' })
	channel!: string | null;

	@ApiPropertyOptional({ nullable: true, example: 'visa' })
	cardBrand!: string | null;

	@ApiPropertyOptional({ nullable: true, example: '4532' })
	cardLast4!: string | null;

	@ApiPropertyOptional({ nullable: true, example: '09/27' })
	cardExpiry!: string | null;

	@ApiPropertyOptional({ nullable: true, example: 'Guaranty Trust Bank' })
	bank!: string | null;
}

export class AdminSubscriberDto {
	@ApiProperty({ format: 'uuid' })
	id!: string;

	@ApiProperty({ format: 'uuid' })
	userId!: string;

	@ApiProperty()
	fullName!: string;

	@ApiProperty()
	email!: string;

	@ApiPropertyOptional({ nullable: true })
	avatarUrl!: string | null;

	@ApiProperty()
	planId!: string;

	@ApiProperty()
	planName!: string;

	@ApiProperty({ enum: BillingCycle, enumName: 'BillingCycle' })
	cycle!: BillingCycle;

	@ApiProperty({ description: 'Kobo per period at today’s plan price.' })
	amountMinor!: number;

	@ApiPropertyOptional({
		type: PaymentMethodDto,
		nullable: true,
		description: 'From the latest successful charge.',
	})
	paymentMethod!: PaymentMethodDto | null;

	@ApiProperty({ enum: SubscriptionStatus, enumName: 'SubscriptionStatus' })
	status!: SubscriptionStatus;

	@ApiProperty()
	startedAt!: Date;

	@ApiProperty({ description: 'Next billing date, or when the plan ends.' })
	currentPeriodEnd!: Date;

	@ApiProperty({
		description: 'A failed renewal with a saved card to retry.',
	})
	canRetry!: boolean;
}

export class AdminSubscriberPageDto {
	@ApiProperty({ type: [AdminSubscriberDto] })
	items!: AdminSubscriberDto[];

	@ApiProperty({ type: PageInfoDto })
	page!: PageInfoDto;
}

export class ListAdminPaymentsQueryDto extends PaginationQueryDto {
	@ApiPropertyOptional({
		maxLength: 100,
		description: 'Name, email or reference.',
	})
	@IsOptional()
	@trim
	@IsString()
	@MaxLength(100)
	search?: string;

	@ApiPropertyOptional({ enum: PaymentStatus, enumName: 'PaymentStatus' })
	@IsOptional()
	@IsEnum(PaymentStatus)
	status?: PaymentStatus;
}

export class AdminPaymentDto {
	@ApiProperty({ format: 'uuid' })
	id!: string;

	@ApiProperty()
	reference!: string;

	@ApiProperty({ format: 'uuid' })
	userId!: string;

	@ApiProperty()
	fullName!: string;

	@ApiProperty()
	email!: string;

	@ApiProperty()
	planName!: string;

	@ApiProperty({ enum: BillingCycle, enumName: 'BillingCycle' })
	cycle!: BillingCycle;

	@ApiProperty({ description: 'Kobo.' })
	amountMinor!: number;

	@ApiProperty({ enum: PaymentStatus, enumName: 'PaymentStatus' })
	status!: PaymentStatus;

	@ApiPropertyOptional({ nullable: true })
	channel!: string | null;

	@ApiPropertyOptional({ nullable: true })
	failureReason!: string | null;

	@ApiPropertyOptional({ nullable: true })
	paidAt!: Date | null;

	@ApiProperty()
	createdAt!: Date;
}

export class AdminPaymentPageDto {
	@ApiProperty({ type: [AdminPaymentDto] })
	items!: AdminPaymentDto[];

	@ApiProperty({ type: PageInfoDto })
	page!: PageInfoDto;
}

export class PaymentSettingsDto {
	@ApiProperty({ description: 'PAYSTACK_SECRET_KEY is set.' })
	configured!: boolean;

	@ApiProperty({ description: 'A test key: no real money moves.' })
	testMode!: boolean;

	@ApiPropertyOptional({
		nullable: true,
		description:
			'Paste into Paystack’s Webhook URL field. Null until PUBLIC_API_URL is set.',
	})
	webhookUrl!: string | null;

	@ApiProperty()
	callbackUrl!: string;

	@ApiProperty({ example: 'NGN' })
	currency!: string;
}

export class SubscriptionPaymentDto {
	@ApiProperty({ format: 'uuid' })
	id!: string;

	@ApiProperty()
	reference!: string;

	@ApiProperty({ description: 'Kobo.' })
	amountMinor!: number;

	@ApiProperty({ enum: PaymentStatus, enumName: 'PaymentStatus' })
	status!: PaymentStatus;

	@ApiPropertyOptional({ nullable: true })
	failureReason!: string | null;

	@ApiProperty()
	createdAt!: Date;

	@ApiPropertyOptional({ nullable: true })
	paidAt!: Date | null;
}

export class AdminSubscriptionDetailDto extends AdminSubscriberDto {
	@ApiPropertyOptional({ nullable: true })
	phone!: string | null;

	@ApiProperty()
	memberSince!: Date;

	@ApiProperty()
	cancelAtPeriodEnd!: boolean;

	@ApiProperty({
		description: 'Kobo, every successful charge on this subscription.',
	})
	totalPaidMinor!: number;

	@ApiProperty({ description: 'Successful charges on this subscription.' })
	paidPeriods!: number;

	@ApiProperty({
		type: [SubscriptionPaymentDto],
		description: 'Newest first, at most 12.',
	})
	payments!: SubscriptionPaymentDto[];

	@ApiProperty({ description: 'There is a successful charge to refund.' })
	canRefund!: boolean;
}
