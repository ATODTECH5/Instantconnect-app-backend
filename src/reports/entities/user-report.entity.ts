import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

export enum UserReportReason {
	Harassment = 'harassment',
	FakeProfile = 'fake_profile',
	Spam = 'spam',
	InappropriateContent = 'inappropriate_content',
	SafetyConcern = 'safety_concern',
	Underage = 'underage',
	Other = 'other',
}

/** Where the member was when they reported, so an admin knows where to look. */
export enum UserReportSource {
	Profile = 'profile',
	Chat = 'chat',
}

export enum UserReportStatus {
	Open = 'open',
	Dismissed = 'dismissed',
	/** An admin acted on it, such as disabling the account. */
	Resolved = 'resolved',
}

/**
 * A member reporting another member. A partial unique index keeps one open
 * report per pair, so reporting again while one is pending changes nothing.
 */
@Entity('user_reports')
@Index('IDX_user_reports_status_createdAt', ['status', 'createdAt'])
@Index('IDX_user_reports_reportedUserId', ['reportedUserId'])
export class UserReport extends BaseEntity {
	@Column({ type: 'uuid' })
	reporterId!: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'reporterId',
		foreignKeyConstraintName: 'FK_user_reports_reporterId',
	})
	reporter!: User;

	@Column({ type: 'uuid' })
	reportedUserId!: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'reportedUserId',
		foreignKeyConstraintName: 'FK_user_reports_reportedUserId',
	})
	reportedUser!: User;

	@Column({ type: 'enum', enum: UserReportReason })
	reason!: UserReportReason;

	@Column({ type: 'varchar', length: 1000, nullable: true })
	details!: string | null;

	@Column({ type: 'enum', enum: UserReportSource })
	source!: UserReportSource;

	@Column({
		type: 'enum',
		enum: UserReportStatus,
		default: UserReportStatus.Open,
	})
	status!: UserReportStatus;

	@Column({ type: 'uuid', nullable: true })
	reviewedById!: string | null;

	@ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
	@JoinColumn({
		name: 'reviewedById',
		foreignKeyConstraintName: 'FK_user_reports_reviewedById',
	})
	reviewedBy!: User | null;

	@Column({ type: 'timestamptz', nullable: true })
	reviewedAt!: Date | null;
}
