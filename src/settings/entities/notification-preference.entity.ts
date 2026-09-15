import {
	Column,
	CreateDateColumn,
	Entity,
	JoinColumn,
	OneToOne,
	PrimaryColumn,
	UpdateDateColumn,
} from 'typeorm';

import { User } from '../../users/entities/user.entity';

/**
 * One row per account, keyed by the user rather than its own id, since there
 * is never more than one. Created on first read with the frame's defaults,
 * so an account that has never opened the screen still has an answer.
 *
 * Columns rather than JSON: the notification service will read these when
 * deciding whether to raise a push or an email, and a typed column is a
 * query where a JSON key is a convention.
 */
@Entity('notification_preferences')
export class NotificationPreference {
	@PrimaryColumn({ type: 'uuid' })
	userId!: string;

	@OneToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'userId',
		foreignKeyConstraintName: 'FK_notification_preferences_userId',
	})
	user!: User;

	@Column({ default: true })
	pushEnabled!: boolean;

	@Column({ default: true })
	pushEventReminders!: boolean;

	@Column({ default: true })
	pushNewConnections!: boolean;

	@Column({ default: true })
	pushMessages!: boolean;

	@Column({ default: true })
	pushCommunityUpdates!: boolean;

	@Column({ default: true })
	emailEnabled!: boolean;

	@Column({ default: true })
	emailEventInvites!: boolean;

	@Column({ default: false })
	emailWeeklyDigest!: boolean;

	@Column({ default: false })
	emailPromotions!: boolean;

	@Column({ default: true })
	inAppEnabled!: boolean;

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt!: Date;

	@UpdateDateColumn({ type: 'timestamptz' })
	updatedAt!: Date;
}
