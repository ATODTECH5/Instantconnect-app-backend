import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { CommunityPost } from './community-post.entity';

/** One level of replies: a reply's parent is always a top level comment. */
@Entity('community_comments')
@Index('IDX_community_comments_postId_createdAt', ['postId', 'createdAt'])
export class CommunityComment extends BaseEntity {
	@Column({ type: 'uuid' })
	postId!: string;

	@ManyToOne(() => CommunityPost, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'postId',
		foreignKeyConstraintName: 'FK_community_comments_postId',
	})
	post!: CommunityPost;

	@Column({ type: 'uuid' })
	authorId!: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'authorId',
		foreignKeyConstraintName: 'FK_community_comments_authorId',
	})
	author!: User;

	@Column({ type: 'uuid', nullable: true })
	parentId!: string | null;

	@ManyToOne(() => CommunityComment, { nullable: true, onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'parentId',
		foreignKeyConstraintName: 'FK_community_comments_parentId',
	})
	parent!: CommunityComment | null;

	@Column({ type: 'varchar', length: 1000 })
	body!: string;

	@Column({ type: 'int', default: 0 })
	likeCount!: number;
}
