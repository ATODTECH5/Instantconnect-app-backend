import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

/** An Eventbrite organizer whose public events are imported. */
@Entity('eventbrite_organizers')
export class EventbriteOrganizer extends BaseEntity {
	/** The number at the end of the organizer's eventbrite.com/o/ page. */
	@Column({ type: 'varchar', length: 32, unique: true })
	organizerId!: string;

	/** Null until Eventbrite has been asked, on adding or on the next sync. */
	@Column({ type: 'varchar', length: 160, nullable: true })
	name!: string | null;

	/** Off keeps the organizer and its events but stops importing new ones. */
	@Column({ default: true })
	isActive!: boolean;

	@Column({ type: 'timestamptz', nullable: true })
	lastSyncedAt!: Date | null;

	/** Why the last sync of this organizer failed; null once one succeeds. */
	@Column({ type: 'varchar', length: 500, nullable: true })
	lastSyncError!: string | null;

	@Column({ type: 'uuid', nullable: true })
	addedById!: string | null;

	@ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
	@JoinColumn({
		name: 'addedById',
		foreignKeyConstraintName: 'FK_eventbrite_organizers_addedById',
	})
	addedBy!: User | null;
}
