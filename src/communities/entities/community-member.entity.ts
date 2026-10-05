import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { Community } from './community.entity';

/** `createdAt` is when they joined. The creator starts as an admin. */
@Entity('community_members')
@Unique('UQ_community_members_communityId_userId', ['communityId', 'userId'])
@Index('IDX_community_members_userId', ['userId'])
export class CommunityMember extends BaseEntity {
	@Column({ type: 'uuid' })
	communityId!: string;

	@ManyToOne(() => Community, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'communityId',
		foreignKeyConstraintName: 'FK_community_members_communityId',
	})
	community!: Community;

	@Column({ type: 'uuid' })
	userId!: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'userId',
		foreignKeyConstraintName: 'FK_community_members_userId',
	})
	user!: User;

	@Column({ default: false })
	isAdmin!: boolean;
}
