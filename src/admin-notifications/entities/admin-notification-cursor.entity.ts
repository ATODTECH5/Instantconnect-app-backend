import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

import { User } from '../../users/entities/user.entity';

/**
 * "Mark all as read": everything that happened up to `readAllAt` counts as
 * read, so the per-item marks behind it can be dropped.
 */
@Entity('admin_notification_cursors')
export class AdminNotificationCursor {
	@PrimaryColumn({ type: 'uuid' })
	adminId!: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
	@JoinColumn({
		name: 'adminId',
		foreignKeyConstraintName: 'FK_admin_notification_cursors_adminId',
	})
	admin!: User;

	@Column({ type: 'timestamptz' })
	readAllAt!: Date;
}
