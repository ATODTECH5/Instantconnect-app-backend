import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { MeetupParticipant } from '../../meetups/entities/meetup-participant.entity';

export enum DispatchTrigger {
	/** Both parties verified each other's arrival. */
	Verified = 'verified',
	Ended = 'ended',
	/** The user pressed "send safe check-in" themselves. */
	Manual = 'manual',
}

export enum DispatchStatus {
	Sent = 'sent',
	Failed = 'failed',
}

/**
 * One row per recipient per trigger. The partial unique index on sent rows
 * is what makes dispatch idempotent: a retry after a partial failure only
 * reaches the people who were missed.
 */
@Entity('safety_dispatches')
export class SafetyDispatch extends BaseEntity {
	@Column({ type: 'uuid' })
	participantId!: string;

	@ManyToOne(() => MeetupParticipant, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'participantId',
		foreignKeyConstraintName: 'FK_safety_dispatches_participantId',
	})
	participant!: MeetupParticipant;

	@Column({ type: 'enum', enum: DispatchTrigger })
	trigger!: DispatchTrigger;

	@Column({ length: 255 })
	recipientEmail!: string;

	@Column({ length: 80 })
	recipientName!: string;

	@Column({ type: 'enum', enum: DispatchStatus })
	status!: DispatchStatus;
}
