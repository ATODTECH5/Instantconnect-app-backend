import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { Conversation } from './conversation.entity';

/**
 * One row per person per thread. Membership is the authorisation: a row exists
 * only for the two parties of an accepted connection, so every read and write
 * checks this table rather than re-deriving the connection's status.
 */
@Entity('conversation_participants')
@Unique('UQ_conversation_participants_pair', ['conversationId', 'userId'])
@Index('IDX_conversation_participants_userId', ['userId'])
export class ConversationParticipant extends BaseEntity {
	@Column({ type: 'uuid' })
	conversationId!: string;

	@ManyToOne(
		() => Conversation,
		(conversation) => conversation.participants,
		{
			onDelete: 'CASCADE',
		},
	)
	@JoinColumn({
		name: 'conversationId',
		foreignKeyConstraintName: 'FK_conversation_participants_conversationId',
	})
	conversation!: Conversation;

	@Column({ type: 'uuid' })
	userId!: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'userId',
		foreignKeyConstraintName: 'FK_conversation_participants_userId',
	})
	user!: User;

	@Column({ type: 'boolean', default: false })
	isFavourite!: boolean;

	/** Null means nothing has been read, so every message counts as unread. */
	@Column({ type: 'timestamptz', nullable: true })
	lastReadAt!: Date | null;
}
