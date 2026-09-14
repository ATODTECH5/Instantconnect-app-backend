import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { ArrivalState } from './arrival-state.enum';
import { Meetup } from './meetup.entity';

/**
 * One row per party. Arrival codes (Phase 3 step 11) and live-location consent
 * (step 12) are columns on this row, not on the meetup, because each person
 * has their own.
 */
@Entity('meetup_participants')
@Unique('UQ_meetup_participants_meetupId_userId', ['meetupId', 'userId'])
export class MeetupParticipant extends BaseEntity {
	@Column({ type: 'uuid' })
	meetupId!: string;

	@ManyToOne(() => Meetup, (meetup) => meetup.participants, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({
		name: 'meetupId',
		foreignKeyConstraintName: 'FK_meetup_participants_meetupId',
	})
	meetup!: Meetup;

	@Column({ type: 'uuid' })
	userId!: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'userId',
		foreignKeyConstraintName: 'FK_meetup_participants_userId',
	})
	user!: User;

	@Column({ type: 'enum', enum: ArrivalState, default: ArrivalState.Pending })
	arrivalState!: ArrivalState;

	@Column({ type: 'timestamptz', nullable: true })
	enRouteAt!: Date | null;

	@Column({ type: 'timestamptz', nullable: true })
	arrivedAt!: Date | null;

	/** Set when the other party confirmed this person's arrival code. */
	@Column({ type: 'timestamptz', nullable: true })
	verifiedAt!: Date | null;
}
