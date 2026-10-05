import {
	Check,
	Column,
	CreateDateColumn,
	Entity,
	JoinColumn,
	ManyToOne,
	PrimaryColumn,
	UpdateDateColumn,
} from 'typeorm';

import { User } from '../../users/entities/user.entity';

/**
 * A paid tier. Free is not a row: it is the absence of a live subscription.
 * Paystack plan codes are minted on first checkout at the current price and
 * cleared when an admin changes it, so the next checkout mints new ones.
 */
@Entity('subscription_plans')
@Check(
	'CHK_subscription_plans_prices',
	'"monthlyPriceMinor" > 0 AND "annualPriceMinor" > 0',
)
export class SubscriptionPlan {
	@PrimaryColumn({ type: 'varchar', length: 16 })
	id!: string;

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt!: Date;

	@UpdateDateColumn({ type: 'timestamptz' })
	updatedAt!: Date;

	@Column({ type: 'varchar', length: 60 })
	name!: string;

	@Column({ type: 'varchar', length: 120 })
	tagline!: string;

	@Column({ type: 'varchar', length: 300 })
	description!: string;

	@Column({ type: 'text', array: true, default: () => "'{}'" })
	features!: string[];

	/** Kobo. */
	@Column({ type: 'int' })
	monthlyPriceMinor!: number;

	/** Kobo, for twelve months paid at once. */
	@Column({ type: 'int' })
	annualPriceMinor!: number;

	@Column({ type: 'smallint', default: 0 })
	sortOrder!: number;

	@Column({ default: true })
	isActive!: boolean;

	@Column({ type: 'varchar', length: 64, nullable: true })
	paystackMonthlyPlanCode!: string | null;

	@Column({ type: 'varchar', length: 64, nullable: true })
	paystackAnnualPlanCode!: string | null;

	@Column({ type: 'uuid', nullable: true })
	updatedById!: string | null;

	@ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
	@JoinColumn({
		name: 'updatedById',
		foreignKeyConstraintName: 'FK_subscription_plans_updatedById',
	})
	updatedBy!: User | null;
}
