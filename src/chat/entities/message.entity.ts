import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { Conversation } from './conversation.entity';
import { MessageKind } from './message-kind.enum';

@Entity('messages')
@Index('IDX_messages_conversationId_createdAt', ['conversationId', 'createdAt'])
export class Message extends BaseEntity {
	@Column({ type: 'uuid' })
	conversationId!: string;

	@ManyToOne(() => Conversation, (conversation) => conversation.messages, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({
		name: 'conversationId',
		foreignKeyConstraintName: 'FK_messages_conversationId',
	})
	conversation!: Conversation;

	@Column({ type: 'uuid' })
	senderId!: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'senderId',
		foreignKeyConstraintName: 'FK_messages_senderId',
	})
	sender!: User;

	@Column({ type: 'enum', enum: MessageKind, default: MessageKind.Text })
	kind!: MessageKind;

	@Column({ type: 'text', nullable: true })
	body!: string | null;

	/**
	 * Only the storage id is kept, never a delivery URL, so a provider change
	 * does not strand rows. Matches `user_photos`.
	 */
	@Column({ type: 'varchar', length: 255, nullable: true })
	mediaStorageId!: string | null;
}
