import {
	CreateDateColumn,
	Entity,
	JoinColumn,
	ManyToOne,
	PrimaryColumn,
} from 'typeorm';

import { User } from '../../users/entities/user.entity';

/**
 * Notifications are derived from other tables, so only the admin's read marks
 * are stored. `notificationId` is `<kind>:<source row id>`.
 */
@Entity('admin_notification_reads')
export class AdminNotificationRead {
	@PrimaryColumn({ type: 'uuid' })
	adminId!: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
	@JoinColumn({
		name: 'adminId',
		foreignKeyConstraintName: 'FK_admin_notification_reads_adminId',
	})
	admin!: User;

	@PrimaryColumn({ type: 'varchar', length: 80 })
	notificationId!: string;

	@CreateDateColumn({ type: 'timestamptz' })
	readAt!: Date;
}
