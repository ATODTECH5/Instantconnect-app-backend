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
import { Category } from '../../reference/entities/category.entity';
import { User } from '../../users/entities/user.entity';
import { EventInvite } from './event-invite.entity';

/** See the Events migration for why price is stored without any ticketing. */
@Entity('events')
@Index('IDX_events_hostId_startsAt', ['hostId', 'startsAt'])
export class Event extends BaseEntity {
	@Column({ type: 'uuid' })
	hostId!: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'hostId',
		foreignKeyConstraintName: 'FK_events_hostId',
	})
	host!: User;

	@Column({ type: 'varchar', length: 80 })
	title!: string;

	@Column({ type: 'varchar', length: 1000, nullable: true })
	description!: string | null;

	@Column({ type: 'timestamptz' })
	startsAt!: Date;

	@Column({ type: 'timestamptz', nullable: true })
	endsAt!: Date | null;

	@Column({ type: 'varchar', length: 120 })
	venueName!: string;

	@Column({ type: 'varchar', length: 255, nullable: true })
	venueAddress!: string | null;

	@Column({
		type: 'geography',
		spatialFeatureType: 'Point',
		srid: 4326,
	})
	venueLocation!: GeoPoint;

	@Column({ type: 'varchar', length: 32, nullable: true })
	categoryId!: string | null;

	@ManyToOne(() => Category, { nullable: true, onDelete: 'SET NULL' })
	@JoinColumn({
		name: 'categoryId',
		foreignKeyConstraintName: 'FK_events_categoryId',
	})
	category!: Category | null;

	/** Kobo. Zero is a free event. */
	@Column({ type: 'int', default: 0 })
	priceMinor!: number;

	/** Off means only the host and the people they invited can open it. */
	@Column({ default: true })
	isPublic!: boolean;

	@Column({ type: 'varchar', length: 255, nullable: true })
	coverStorageId!: string | null;

	@OneToMany(() => EventInvite, (invite) => invite.event)
	invites!: EventInvite[];
}
