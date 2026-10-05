import {
	Check,
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

export enum ExternalEventSource {
	Eventbrite = 'eventbrite',
}

/**
 * See the Events migration for why price is stored without any ticketing, and
 * the ExternalEvents migration for imported events, which have no host.
 */
@Entity('events')
@Index('IDX_events_hostId_startsAt', ['hostId', 'startsAt'])
@Index('IDX_events_createdAt', ['createdAt'])
@Index(
	'UQ_events_externalSource_externalId',
	['externalSource', 'externalId'],
	{ unique: true, where: '"externalSource" IS NOT NULL' },
)
@Index('IDX_events_externalOrganizerId', ['externalOrganizerId'], {
	where: '"externalOrganizerId" IS NOT NULL',
})
@Check(
	'CHK_events_host_or_source',
	'"hostId" IS NOT NULL OR "externalSource" IS NOT NULL',
)
export class Event extends BaseEntity {
	@Column({ type: 'uuid', nullable: true })
	hostId!: string | null;

	@ManyToOne(() => User, { nullable: true, onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'hostId',
		foreignKeyConstraintName: 'FK_events_hostId',
	})
	host!: User | null;

	@Column({ type: 'enum', enum: ExternalEventSource, nullable: true })
	externalSource!: ExternalEventSource | null;

	@Column({ type: 'varchar', length: 64, nullable: true })
	externalId!: string | null;

	/** Where to register or buy a ticket. Instant Connect sells none. */
	@Column({ type: 'varchar', length: 500, nullable: true })
	externalUrl!: string | null;

	@Column({ type: 'varchar', length: 500, nullable: true })
	externalCoverUrl!: string | null;

	@Column({ type: 'varchar', length: 120, nullable: true })
	organizerName!: string | null;

	/** The listing's own organizer id, matching `eventbrite_organizers`. */
	@Column({ type: 'varchar', length: 32, nullable: true })
	externalOrganizerId!: string | null;

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

	@Index('IDX_events_venueLocation', { spatial: true })
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
