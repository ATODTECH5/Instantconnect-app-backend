import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { ConnectionStatus } from './connection-status.enum';

/**
 * One row per pair of people, in whichever direction it was first asked. The
 * uniqueness that guarantees this is expressed over LEAST/GREATEST of the two
 * ids, which TypeORM cannot describe, so it lives in the migration instead.
 */
@Entity('connections')
@Index('IDX_connections_addressee_status', ['addresseeId', 'status'])
@Index('IDX_connections_requester_status', ['requesterId', 'status'])
export class Connection extends BaseEntity {
	@Column({ type: 'uuid' })
	requesterId!: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'requesterId',
		foreignKeyConstraintName: 'FK_connections_requesterId',
	})
	requester!: User;

	@Column({ type: 'uuid' })
	addresseeId!: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'addresseeId',
		foreignKeyConstraintName: 'FK_connections_addresseeId',
	})
	addressee!: User;

	@Column({
		type: 'enum',
		enum: ConnectionStatus,
		default: ConnectionStatus.Pending,
	})
	status!: ConnectionStatus;

	@Column({ type: 'timestamptz', nullable: true })
	respondedAt!: Date | null;

	otherPartyId(viewerId: string): string {
		return this.requesterId === viewerId
			? this.addresseeId
			: this.requesterId;
	}
}
