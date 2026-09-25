import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { Event } from './event.entity';

@Entity('event_invites')
@Unique('UQ_event_invites_eventId_userId', ['eventId', 'userId'])
@Index('IDX_event_invites_userId', ['userId'])
export class EventInvite extends BaseEntity {
	@Column({ type: 'uuid' })
	eventId!: string;

	@ManyToOne(() => Event, (event) => event.invites, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'eventId',
		foreignKeyConstraintName: 'FK_event_invites_eventId',
	})
	event!: Event;

	@Column({ type: 'uuid' })
	userId!: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'userId',
		foreignKeyConstraintName: 'FK_event_invites_userId',
	})
	user!: User;
}
