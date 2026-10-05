import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { CommunityComment } from './community-comment.entity';

@Entity('community_comment_likes')
@Unique('UQ_community_comment_likes_commentId_userId', ['commentId', 'userId'])
export class CommunityCommentLike extends BaseEntity {
	@Column({ type: 'uuid' })
	commentId!: string;

	@ManyToOne(() => CommunityComment, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'commentId',
		foreignKeyConstraintName: 'FK_community_comment_likes_commentId',
	})
	comment!: CommunityComment;

	@Column({ type: 'uuid' })
	userId!: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'userId',
		foreignKeyConstraintName: 'FK_community_comment_likes_userId',
	})
	user!: User;
}
