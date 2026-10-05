import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { Community } from './community.entity';

/**
 * An open invitation; joining spends it. It is what lets someone see and join
 * a private community. Only accepted connections can be invited.
 */
@Entity('community_invites')
@Unique('UQ_community_invites_communityId_userId', ['communityId', 'userId'])
@Index('IDX_community_invites_userId', ['userId'])
export class CommunityInvite extends BaseEntity {
	@Column({ type: 'uuid' })
	communityId!: string;

	@ManyToOne(() => Community, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'communityId',
		foreignKeyConstraintName: 'FK_community_invites_communityId',
	})
	community!: Community;

	@Column({ type: 'uuid' })
	userId!: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'userId',
		foreignKeyConstraintName: 'FK_community_invites_userId',
	})
	user!: User;

	@Column({ type: 'uuid', nullable: true })
	invitedById!: string | null;

	@ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
	@JoinColumn({
		name: 'invitedById',
		foreignKeyConstraintName: 'FK_community_invites_invitedById',
	})
	invitedBy!: User | null;
}
