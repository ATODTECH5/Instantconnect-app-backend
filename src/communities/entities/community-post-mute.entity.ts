import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { CommunityPost } from './community-post.entity';

/** Muted: no comment or reply notifications from this post. */
@Entity('community_post_mutes')
@Unique('UQ_community_post_mutes_postId_userId', ['postId', 'userId'])
export class CommunityPostMute extends BaseEntity {
	@Column({ type: 'uuid' })
	postId!: string;

	@ManyToOne(() => CommunityPost, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'postId',
		foreignKeyConstraintName: 'FK_community_post_mutes_postId',
	})
	post!: CommunityPost;

	@Column({ type: 'uuid' })
	userId!: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'userId',
		foreignKeyConstraintName: 'FK_community_post_mutes_userId',
	})
	user!: User;
}
