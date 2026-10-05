import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { CommunityPost } from './community-post.entity';

@Entity('community_post_likes')
@Unique('UQ_community_post_likes_postId_userId', ['postId', 'userId'])
export class CommunityPostLike extends BaseEntity {
	@Column({ type: 'uuid' })
	postId!: string;

	@ManyToOne(() => CommunityPost, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'postId',
		foreignKeyConstraintName: 'FK_community_post_likes_postId',
	})
	post!: CommunityPost;

	@Column({ type: 'uuid' })
	userId!: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'userId',
		foreignKeyConstraintName: 'FK_community_post_likes_userId',
	})
	user!: User;
}
