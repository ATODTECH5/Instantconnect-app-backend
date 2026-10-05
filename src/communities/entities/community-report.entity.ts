import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { CommunityPost } from './community-post.entity';

export enum CommunityReportReason {
	Spam = 'spam',
	Harassment = 'harassment',
	Misinformation = 'misinformation',
	HateSpeech = 'hate_speech',
	Violence = 'violence',
	SexualContent = 'sexual_content',
	Other = 'other',
}

export enum CommunityReportStatus {
	Open = 'open',
	Dismissed = 'dismissed',
	/** The post was hidden. */
	Removed = 'removed',
}

/** One per reporter per post, so reporting twice cannot inflate the queue. */
@Entity('community_reports')
@Unique('UQ_community_reports_postId_reporterId', ['postId', 'reporterId'])
@Index('IDX_community_reports_status_createdAt', ['status', 'createdAt'])
export class CommunityReport extends BaseEntity {
	@Column({ type: 'uuid' })
	postId!: string;

	@ManyToOne(() => CommunityPost, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'postId',
		foreignKeyConstraintName: 'FK_community_reports_postId',
	})
	post!: CommunityPost;

	@Column({ type: 'uuid' })
	reporterId!: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'reporterId',
		foreignKeyConstraintName: 'FK_community_reports_reporterId',
	})
	reporter!: User;

	@Column({ type: 'enum', enum: CommunityReportReason })
	reason!: CommunityReportReason;

	@Column({ type: 'varchar', length: 500, nullable: true })
	details!: string | null;

	@Column({
		type: 'enum',
		enum: CommunityReportStatus,
		default: CommunityReportStatus.Open,
	})
	status!: CommunityReportStatus;

	@Column({ type: 'uuid', nullable: true })
	reviewedById!: string | null;

	@ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
	@JoinColumn({
		name: 'reviewedById',
		foreignKeyConstraintName: 'FK_community_reports_reviewedById',
	})
	reviewedBy!: User | null;

	@Column({ type: 'timestamptz', nullable: true })
	reviewedAt!: Date | null;
}
