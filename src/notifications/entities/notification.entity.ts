import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { NotificationKind } from './notification-kind.enum';

/**
 * One row per thing a person should be told about. Deliberately holds no
 * rendered text: the title and body are derived from the kind and the actor at
 * read time, so a name change does not strand copy written months ago. Same
 * argument as storing a photo's storageId rather than its URL.
 */
@Entity('notifications')
@Index('IDX_notifications_userId_createdAt', ['userId', 'createdAt'])
export class Notification extends BaseEntity {
	/** Who is being told. */
	@Column({ type: 'uuid' })
	userId!: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'userId',
		foreignKeyConstraintName: 'FK_notifications_userId',
	})
	user!: User;

	@Column({ type: 'enum', enum: NotificationKind })
	kind!: NotificationKind;

	/** Who caused it. Null for anything the system raises on its own. */
	@Column({ type: 'uuid', nullable: true })
	actorId!: string | null;

	@ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
	@JoinColumn({
		name: 'actorId',
		foreignKeyConstraintName: 'FK_notifications_actorId',
	})
	actor!: User | null;

	/**
	 * What to open: a conversation id for a message, a connection id for the
	 * two connection kinds. Untyped on purpose, since the kind already says
	 * which it is and a column per kind would be mostly nulls.
	 */
	@Column({ type: 'uuid', nullable: true })
	subjectId!: string | null;

	@Column({ type: 'timestamptz', nullable: true })
	readAt!: Date | null;
}
