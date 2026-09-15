import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { SafetyCircle } from './safety-circle.entity';

/**
 * An outside contact, not an account. See the SafetyCircles migration for
 * why. `phone` is stored but unused until an SMS channel exists.
 */
@Entity('safety_circle_members')
@Unique('UQ_safety_circle_members_circleId_email', ['circleId', 'email'])
export class SafetyCircleMember extends BaseEntity {
	@Column({ type: 'uuid' })
	circleId!: string;

	@ManyToOne(() => SafetyCircle, (circle) => circle.members, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({
		name: 'circleId',
		foreignKeyConstraintName: 'FK_safety_circle_members_circleId',
	})
	circle!: SafetyCircle;

	@Column({ length: 80 })
	name!: string;

	@Column({ length: 255 })
	email!: string;

	@Column({ type: 'varchar', length: 20, nullable: true })
	phone!: string | null;
}
