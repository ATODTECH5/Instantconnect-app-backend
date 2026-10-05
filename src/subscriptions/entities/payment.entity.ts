import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { SubscriptionPlan } from './subscription-plan.entity';
import { BillingCycle, Subscription } from './subscription.entity';

export enum PaymentStatus {
	Pending = 'pending',
	Success = 'success',
	Failed = 'failed',
	/** Checkout was opened and never completed. */
	Abandoned = 'abandoned',
	/** Paid, then refunded by an admin. */
	Refunded = 'refunded',
}

/** One charge: the first checkout or a renewal. */
@Entity('payments')
@Unique('UQ_payments_reference', ['reference'])
@Index('IDX_payments_userId_createdAt', ['userId', 'createdAt'])
@Index('IDX_payments_status_paidAt', ['status', 'paidAt'])
export class Payment extends BaseEntity {
	@Column({ type: 'uuid' })
	userId!: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'userId',
		foreignKeyConstraintName: 'FK_payments_userId',
	})
	user!: User;

	@Column({ type: 'uuid', nullable: true })
	subscriptionId!: string | null;

	@ManyToOne(() => Subscription, { nullable: true, onDelete: 'SET NULL' })
	@JoinColumn({
		name: 'subscriptionId',
		foreignKeyConstraintName: 'FK_payments_subscriptionId',
	})
	subscription!: Subscription | null;

	@Column({ type: 'varchar', length: 16 })
	planId!: string;

	@ManyToOne(() => SubscriptionPlan)
	@JoinColumn({
		name: 'planId',
		foreignKeyConstraintName: 'FK_payments_planId',
	})
	plan!: SubscriptionPlan;

	@Column({
		type: 'enum',
		enum: BillingCycle,
		enumName: 'subscriptions_cycle_enum',
	})
	cycle!: BillingCycle;

	@Column({ type: 'varchar', length: 100 })
	reference!: string;

	@Column({ type: 'int' })
	amountMinor!: number;

	@Column({ type: 'varchar', length: 3, default: 'NGN' })
	currency!: string;

	@Column({
		type: 'enum',
		enum: PaymentStatus,
		default: PaymentStatus.Pending,
	})
	status!: PaymentStatus;

	@Column({ type: 'varchar', length: 32, nullable: true })
	channel!: string | null;

	@Column({ type: 'timestamptz', nullable: true })
	paidAt!: Date | null;

	@Column({ type: 'varchar', length: 255, nullable: true })
	failureReason!: string | null;

	/** "visa", "mastercard", "verve"; null for a bank or USSD payment. */
	@Column({ type: 'varchar', length: 20, nullable: true })
	cardBrand!: string | null;

	@Column({ type: 'varchar', length: 4, nullable: true })
	cardLast4!: string | null;

	/** "MM/YY". */
	@Column({ type: 'varchar', length: 5, nullable: true })
	cardExpiry!: string | null;

	@Column({ type: 'varchar', length: 80, nullable: true })
	bank!: string | null;

	@Column({ type: 'timestamptz', nullable: true })
	refundedAt!: Date | null;
}
