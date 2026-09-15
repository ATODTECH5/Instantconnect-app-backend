import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { MeetupParticipant } from '../../meetups/entities/meetup-participant.entity';
import { SafetyCircle } from './safety-circle.entity';

/** Which of a participant's circles hear about one particular meetup. */
@Entity('meetup_circle_selections')
@Unique('UQ_meetup_circle_selections_participantId_circleId', [
	'participantId',
	'circleId',
])
export class MeetupCircleSelection extends BaseEntity {
	@Column({ type: 'uuid' })
	participantId!: string;

	@ManyToOne(() => MeetupParticipant, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'participantId',
		foreignKeyConstraintName: 'FK_meetup_circle_selections_participantId',
	})
	participant!: MeetupParticipant;

	@Column({ type: 'uuid' })
	circleId!: string;

	@ManyToOne(() => SafetyCircle, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'circleId',
		foreignKeyConstraintName: 'FK_meetup_circle_selections_circleId',
	})
	circle!: SafetyCircle;
}
