import {
	Column,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	OneToMany,
} from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import type { GeoPoint } from '../../common/utils/geo.util';
import { Conversation } from '../../chat/entities/conversation.entity';
import { User } from '../../users/entities/user.entity';
import { MeetupParticipant } from './meetup-participant.entity';
import { MeetupStatus } from './meetup-status.enum';

/**
 * See the Meetups migration for why a meetup belongs to a conversation and
 * carries two levels of state.
 */
@Entity('meetups')
@Index('IDX_meetups_conversationId_createdAt', ['conversationId', 'createdAt'])
export class Meetup extends BaseEntity {
	@Column({ type: 'uuid' })
	conversationId!: string;

	@ManyToOne(() => Conversation, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'conversationId',
		foreignKeyConstraintName: 'FK_meetups_conversationId',
	})
	conversation!: Conversation;

	/** Whoever opened the first proposal. Fixed for the meetup's life. */
	@Column({ type: 'uuid' })
	proposerId!: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'proposerId',
		foreignKeyConstraintName: 'FK_meetups_proposerId',
	})
	proposer!: User;

	@Column({ type: 'uuid' })
	inviteeId!: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'inviteeId',
		foreignKeyConstraintName: 'FK_meetups_inviteeId',
	})
	invitee!: User;

	@Column({
		type: 'enum',
		enum: MeetupStatus,
		default: MeetupStatus.Proposed,
	})
	status!: MeetupStatus;

	/**
	 * Whose answer is pending while proposed. Flips on a counter-proposal, so
	 * "who proposed" and "who must answer" are separate questions.
	 */
	@Column({ type: 'uuid', nullable: true })
	awaitingUserId!: string | null;

	/** ISO timestamps, one to five, all in the future when written. */
	@Column({ type: 'jsonb', default: () => "'[]'" })
	proposedTimes!: string[];

	@Column({ type: 'timestamptz', nullable: true })
	scheduledAt!: Date | null;

	@Column({ type: 'varchar', length: 120, nullable: true })
	venueName!: string | null;

	@Column({ type: 'varchar', length: 255, nullable: true })
	venueAddress!: string | null;

	@Column({
		type: 'geography',
		spatialFeatureType: 'Point',
		srid: 4326,
		nullable: true,
	})
	venueLocation!: GeoPoint | null;

	@Column({ type: 'timestamptz', nullable: true })
	respondedAt!: Date | null;

	/** When it became active. */
	@Column({ type: 'timestamptz', nullable: true })
	startedAt!: Date | null;

	@Column({ type: 'timestamptz', nullable: true })
	endedAt!: Date | null;

	@Column({ type: 'timestamptz', nullable: true })
	cancelledAt!: Date | null;

	@Column({ type: 'uuid', nullable: true })
	cancelledById!: string | null;

	@OneToMany(() => MeetupParticipant, (party) => party.meetup)
	participants!: MeetupParticipant[];
}
