import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { SubscriptionPlan } from './subscription-plan.entity';

export enum BillingCycle {
	Monthly = 'monthly',
	Annual = 'annual',
}

export enum SubscriptionStatus {
	Active = 'active',
	/** Cancelled by the member: paid up until `currentPeriodEnd`, then expires. */
	NonRenewing = 'non_renewing',
	/** A renewal charge failed; Paystack retries before giving up. */
	PastDue = 'past_due',
	/** Replaced by another plan. */
	Cancelled = 'cancelled',
	Expired = 'expired',
}

/** The statuses that grant the plan; at most one row per member holds one. */
export const LIVE_STATUSES = [
	SubscriptionStatus.Active,
	SubscriptionStatus.NonRenewing,
	SubscriptionStatus.PastDue,
];

@Entity('subscriptions')
@Index('UQ_subscriptions_live_per_user', ['userId'], {
	unique: true,
	where: `"status" IN ('active', 'non_renewing', 'past_due')`,
})
@Index('IDX_subscriptions_paystackSubscriptionCode', [
	'paystackSubscriptionCode',
])
export class Subscription extends BaseEntity {
	@Column({ type: 'uuid' })
	userId!: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'userId',
		foreignKeyConstraintName: 'FK_subscriptions_userId',
	})
	user!: User;

	@Column({ type: 'varchar', length: 16 })
	planId!: string;

	@ManyToOne(() => SubscriptionPlan)
	@JoinColumn({
		name: 'planId',
		foreignKeyConstraintName: 'FK_subscriptions_planId',
	})
	plan!: SubscriptionPlan;

	@Column({ type: 'enum', enum: BillingCycle })
	cycle!: BillingCycle;

	@Column({ type: 'enum', enum: SubscriptionStatus })
	status!: SubscriptionStatus;

	/** Paid up until here. Renewals move it on. */
	@Column({ type: 'timestamptz' })
	currentPeriodEnd!: Date;

	@Column({ type: 'varchar', length: 64, nullable: true })
	paystackCustomerCode!: string | null;

	/** Arrives with Paystack's subscription.create event, shortly after the first charge. */
	@Column({ type: 'varchar', length: 64, nullable: true })
	paystackSubscriptionCode!: string | null;

	/** Needed, with the code, to stop renewals. */
	@Column({ type: 'varchar', length: 64, nullable: true })
	paystackEmailToken!: string | null;

	@Column({ type: 'varchar', length: 64, nullable: true })
	paystackPlanCode!: string | null;

	/** The reusable authorization from the last successful charge, for retries. */
	@Column({ type: 'varchar', length: 64, nullable: true })
	paystackAuthorizationCode!: string | null;

	@Column({ type: 'timestamptz', nullable: true })
	cancelledAt!: Date | null;
}
