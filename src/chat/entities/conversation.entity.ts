import { Column, Entity, JoinColumn, OneToMany, OneToOne } from 'typeorm';
import { CreateDateColumn, PrimaryColumn, UpdateDateColumn } from 'typeorm';

import { Connection } from '../../connections/entities/connection.entity';
import { ConversationParticipant } from './conversation-participant.entity';
import { Message } from './message.entity';

/**
 * Shares its primary key with the connection that authorises it, so it does not
 * extend BaseEntity: the id is supplied rather than generated. See the Chat
 * migration for why there is no separate `connectionId`.
 */
@Entity('conversations')
export class Conversation {
	@PrimaryColumn({ type: 'uuid' })
	id!: string;

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt!: Date;

	@UpdateDateColumn({ type: 'timestamptz' })
	updatedAt!: Date;

	@OneToOne(() => Connection, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'id', foreignKeyConstraintName: 'FK_conversations_id' })
	connection!: Connection;

	/** Null until the first message. Ordering key for the chat list. */
	@Column({ type: 'timestamptz', nullable: true })
	lastMessageAt!: Date | null;

	@OneToMany(() => ConversationParticipant, (party) => party.conversation)
	participants!: ConversationParticipant[];

	@OneToMany(() => Message, (message) => message.conversation)
	messages!: Message[];
}
