import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Directional: the blocker chose it and only the blocker can undo it. Both
 * directions are checked wherever it matters (discovery, connections, chat),
 * so being blocked hides the blocker from you as much as you from them.
 */
@Entity('blocks')
@Index('UQ_blocks_blockerId_blockedId', ['blockerId', 'blockedId'], {
	unique: true,
})
@Index('IDX_blocks_blockedId', ['blockedId'])
export class Block extends BaseEntity {
	@Column({ type: 'uuid' })
	blockerId!: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
	@JoinColumn({
		name: 'blockerId',
		foreignKeyConstraintName: 'FK_blocks_blockerId',
	})
	blocker!: User;

	@Column({ type: 'uuid' })
	blockedId!: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
	@JoinColumn({
		name: 'blockedId',
		foreignKeyConstraintName: 'FK_blocks_blockedId',
	})
	blocked!: User;
}
