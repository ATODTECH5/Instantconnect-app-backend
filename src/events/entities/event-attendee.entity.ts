import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { Event } from './event.entity';

@Entity('event_attendees')
@Unique('UQ_event_attendees_eventId_userId', ['eventId', 'userId'])
@Index('IDX_event_attendees_userId', ['userId'])
export class EventAttendee extends BaseEntity {
	@Column({ type: 'uuid' })
	eventId!: string;

	@ManyToOne(() => Event, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'eventId',
		foreignKeyConstraintName: 'FK_event_attendees_eventId',
	})
	event!: Event;

	@Column({ type: 'uuid' })
	userId!: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'userId',
		foreignKeyConstraintName: 'FK_event_attendees_userId',
	})
	user!: User;
}
