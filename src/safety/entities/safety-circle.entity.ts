import {
	Column,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	OneToMany,
} from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { SafetyCircleMember } from './safety-circle-member.entity';

@Entity('safety_circles')
@Index('IDX_safety_circles_ownerId', ['ownerId'])
export class SafetyCircle extends BaseEntity {
	@Column({ type: 'uuid' })
	ownerId!: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'ownerId',
		foreignKeyConstraintName: 'FK_safety_circles_ownerId',
	})
	owner!: User;

	@Column({ length: 60 })
	name!: string;

	@OneToMany(() => SafetyCircleMember, (member) => member.circle)
	members!: SafetyCircleMember[];
}
