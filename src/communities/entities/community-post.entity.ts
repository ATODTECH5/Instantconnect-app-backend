import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { Community } from './community.entity';

@Entity('community_posts')
@Index('IDX_community_posts_feed', ['communityId', 'isPinned', 'createdAt'])
@Check(
	'CHK_community_posts_has_content',
	'"body" IS NOT NULL OR "mediaStorageId" IS NOT NULL',
)
export class CommunityPost extends BaseEntity {
	@Column({ type: 'uuid' })
	communityId!: string;

	@ManyToOne(() => Community, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'communityId',
		foreignKeyConstraintName: 'FK_community_posts_communityId',
	})
	community!: Community;

	@Column({ type: 'uuid' })
	authorId!: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'authorId',
		foreignKeyConstraintName: 'FK_community_posts_authorId',
	})
	author!: User;

	@Column({ type: 'varchar', length: 2000, nullable: true })
	body!: string | null;

	@Column({ type: 'varchar', length: 255, nullable: true })
	mediaStorageId!: string | null;

	@Column({ default: false })
	isPinned!: boolean;

	@Column({ type: 'timestamptz', nullable: true })
	editedAt!: Date | null;

	@Column({ type: 'int', default: 0 })
	likeCount!: number;

	@Column({ type: 'int', default: 0 })
	commentCount!: number;

	/**
	 * Set when an admin removes it after a report. Kept rather than deleted so
	 * the report keeps what it was about.
	 */
	@Column({ default: false })
	isHidden!: boolean;
}
