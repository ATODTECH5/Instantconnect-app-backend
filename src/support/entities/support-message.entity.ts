import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

export enum SupportMessageDirection {
	/** Typed by the account in Live Chat. */
	Inbound = 'inbound',
	/** A reply from the support team. */
	Outbound = 'outbound',
}

/**
 * One thread per account. There is no agent on the other end yet, so an
 * outbound row is written only by an admin through the reply endpoint; the
 * Messages sheet lists those, Live Chat shows both directions.
 */
@Entity('support_messages')
@Index('IDX_support_messages_userId_createdAt', ['userId', 'createdAt'])
export class SupportMessage extends BaseEntity {
	@Column({ type: 'uuid' })
	userId!: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
	@JoinColumn({
		name: 'userId',
		foreignKeyConstraintName: 'FK_support_messages_userId',
	})
	user!: User;

	@Column({ type: 'enum', enum: SupportMessageDirection })
	direction!: SupportMessageDirection;

	/** Outbound only: who on the team wrote it. */
	@Column({ type: 'varchar', length: 80, nullable: true })
	agentName!: string | null;

	/** Outbound only: what the reply is about, shown on the Messages row. */
	@Column({ type: 'varchar', length: 120, nullable: true })
	subject!: string | null;

	@Column({ type: 'text' })
	body!: string;
}
