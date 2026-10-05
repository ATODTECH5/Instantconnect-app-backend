import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { Category } from '../../reference/entities/category.entity';
import { User } from '../../users/entities/user.entity';

/**
 * A group members create and post in. The one official row is the Safety
 * Community: every member belongs to it without a membership row, it cannot
 * be left, and only platform admins post as its team.
 */
@Entity('communities')
@Index('UQ_communities_official', ['isOfficial'], {
	unique: true,
	where: '"isOfficial"',
})
@Index('IDX_communities_lastActivityAt', ['lastActivityAt'])
export class Community extends BaseEntity {
	@Column({ type: 'varchar', length: 60 })
	name!: string;

	@Column({ type: 'varchar', length: 500, nullable: true })
	description!: string | null;

	@Column({ type: 'varchar', length: 32, nullable: true })
	categoryId!: string | null;

	@ManyToOne(() => Category, { nullable: true, onDelete: 'SET NULL' })
	@JoinColumn({
		name: 'categoryId',
		foreignKeyConstraintName: 'FK_communities_categoryId',
	})
	category!: Category | null;

	@Column({ type: 'varchar', length: 255, nullable: true })
	coverStorageId!: string | null;

	/** Off: only members and invitees can find it, read it or join it. */
	@Column({ default: true })
	isPublic!: boolean;

	@Column({ default: false })
	isOfficial!: boolean;

	@Column({ type: 'uuid', nullable: true })
	creatorId!: string | null;

	@ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
	@JoinColumn({
		name: 'creatorId',
		foreignKeyConstraintName: 'FK_communities_creatorId',
	})
	creator!: User | null;

	/** Moves on each post or comment, for "Active 2m ago" and ordering. */
	@Column({ type: 'timestamptz', default: () => 'now()' })
	lastActivityAt!: Date;
}
