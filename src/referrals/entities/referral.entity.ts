import {
	Column,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	OneToOne,
} from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Written when someone registers with a referral code. Carries no status of
 * its own: the referral is "joined" once the referee has verified their email
 * and "pending" until then, and that fact already lives on the referee.
 */
@Entity('referrals')
@Index('IDX_referrals_referrerId_createdAt', ['referrerId', 'createdAt'])
export class Referral extends BaseEntity {
	@Column({ type: 'uuid' })
	referrerId!: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
	@JoinColumn({
		name: 'referrerId',
		foreignKeyConstraintName: 'FK_referrals_referrerId',
	})
	referrer!: User;

	/** Unique: a person is referred once, by whoever's code they registered with. */
	@Column({ type: 'uuid', unique: true })
	refereeId!: string;

	@OneToOne(() => User, { onDelete: 'CASCADE', nullable: false })
	@JoinColumn({
		name: 'refereeId',
		foreignKeyConstraintName: 'FK_referrals_refereeId',
	})
	referee!: User;
}
