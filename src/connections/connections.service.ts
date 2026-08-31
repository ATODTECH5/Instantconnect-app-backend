import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import {
	PageInfoDto,
	type PaginationQueryDto,
} from '../common/dto/pagination.dto';
import { Storage } from '../storage/storage';
import { AVATAR_POSITION } from '../users/entities/user-photo.entity';
import { User } from '../users/entities/user.entity';
import { UserStatus } from '../users/entities/user-status.enum';
import type { ConnectionState } from './connection-state';
import {
	ConnectionPageDto,
	ConnectionResponseDto,
} from './dto/connection-response.dto';
import type { ConnectionDecision } from './dto/respond-connection.dto';
import { Connection } from './entities/connection.entity';
import { ConnectionStatus } from './entities/connection-status.enum';

const PARTY_RELATIONS = {
	requester: { photos: true },
	addressee: { photos: true },
} as const;

@Injectable()
export class ConnectionsService {
	constructor(
		@InjectRepository(Connection)
		private readonly connections: Repository<Connection>,
		@InjectRepository(User)
		private readonly users: Repository<User>,
		private readonly storage: Storage,
	) {}

	/**
	 * A declined request stays declined. Re-asking is how a rejected approach
	 * turns into harassment, and this app puts strangers in a room together, so
	 * the recipient's no is final until they change it themselves.
	 */
	async request(
		requesterId: string,
		addresseeId: string,
	): Promise<ConnectionResponseDto> {
		if (requesterId === addresseeId) {
			throw new BadRequestException({
				code: 'CANNOT_CONNECT_TO_SELF',
				message: 'You cannot send yourself a connection request.',
			});
		}

		const addressee = await this.users.findOne({
			where: { id: addresseeId, status: UserStatus.Active },
			select: { id: true },
		});

		if (!addressee) {
			throw new NotFoundException({
				code: 'USER_NOT_FOUND',
				message: 'That person is no longer available.',
			});
		}

		const existing = await this.findPair(requesterId, addresseeId);

		if (existing) throw this.conflictFor(existing, requesterId);

		const saved = await this.connections.save(
			this.connections.create({
				requesterId,
				addresseeId,
				status: ConnectionStatus.Pending,
			}),
		);

		return this.toResponse(
			await this.loadWithParties(saved.id),
			requesterId,
		);
	}

	async respond(
		viewerId: string,
		connectionId: string,
		status: ConnectionDecision,
	): Promise<ConnectionResponseDto> {
		const connection = await this.loadWithParties(connectionId);

		if (connection.addresseeId !== viewerId) {
			throw new ForbiddenException({
				code: 'NOT_YOUR_REQUEST',
				message:
					'Only the person who received a request can answer it.',
			});
		}

		if (connection.status !== ConnectionStatus.Pending) {
			throw new ConflictException({
				code: 'REQUEST_ALREADY_ANSWERED',
				message: 'That request has already been answered.',
			});
		}

		connection.status = status;
		connection.respondedAt = new Date();

		return this.toResponse(
			await this.connections.save(connection),
			viewerId,
		);
	}

	async list(
		viewerId: string,
		query: PaginationQueryDto,
		status?: ConnectionStatus,
	): Promise<ConnectionPageDto> {
		const asRequester = {
			requesterId: viewerId,
			...(status ? { status } : {}),
		};
		const asAddressee = {
			addresseeId: viewerId,
			...(status ? { status } : {}),
		};

		const [rows, total] = await this.connections.findAndCount({
			where: [asRequester, asAddressee],
			relations: PARTY_RELATIONS,
			order: { createdAt: 'DESC' },
			take: query.limit,
			skip: query.offset,
		});

		return new ConnectionPageDto(
			rows.map((row) => this.toResponse(row, viewerId)),
			new PageInfoDto(total, query),
		);
	}

	countAccepted(userId: string): Promise<number> {
		return this.connections.count({
			where: [
				{ requesterId: userId, status: ConnectionStatus.Accepted },
				{ addresseeId: userId, status: ConnectionStatus.Accepted },
			],
		});
	}

	/**
	 * One query for a page of discovery results, rather than one per card.
	 * Anyone with no row is absent from the map and reads as 'none'.
	 */
	async statesFor(
		viewerId: string,
		otherIds: string[],
	): Promise<Map<string, ConnectionState>> {
		if (otherIds.length === 0) return new Map();

		const rows = await this.connections.find({
			where: [
				{ requesterId: viewerId, addresseeId: In(otherIds) },
				{ addresseeId: viewerId, requesterId: In(otherIds) },
			],
			select: {
				id: true,
				requesterId: true,
				addresseeId: true,
				status: true,
			},
		});

		return new Map(
			rows.map((row) => [
				row.otherPartyId(viewerId),
				stateOf(row, viewerId),
			]),
		);
	}

	private findPair(a: string, b: string): Promise<Connection | null> {
		return this.connections.findOne({
			where: [
				{ requesterId: a, addresseeId: b },
				{ requesterId: b, addresseeId: a },
			],
		});
	}

	private conflictFor(
		existing: Connection,
		requesterId: string,
	): ConflictException {
		if (existing.status === ConnectionStatus.Accepted) {
			return new ConflictException({
				code: 'ALREADY_CONNECTED',
				message: 'You are already connected.',
			});
		}

		if (existing.status === ConnectionStatus.Declined) {
			return new ConflictException({
				code: 'REQUEST_DECLINED',
				message: 'That request was declined.',
			});
		}

		return existing.requesterId === requesterId
			? new ConflictException({
					code: 'REQUEST_ALREADY_SENT',
					message: 'You have already sent that request.',
				})
			: new ConflictException({
					code: 'REQUEST_ALREADY_RECEIVED',
					message:
						'They already sent you a request. Answer it instead.',
				});
	}

	private async loadWithParties(id: string): Promise<Connection> {
		const connection = await this.connections.findOne({
			where: { id },
			relations: PARTY_RELATIONS,
		});

		if (!connection) {
			throw new NotFoundException({
				code: 'CONNECTION_NOT_FOUND',
				message: 'That connection request no longer exists.',
			});
		}

		return connection;
	}

	private toResponse(
		connection: Connection,
		viewerId: string,
	): ConnectionResponseDto {
		const party =
			connection.requesterId === viewerId
				? connection.addressee
				: connection.requester;

		const avatar = party.photos?.find(
			(photo) => photo.position === AVATAR_POSITION,
		);

		return new ConnectionResponseDto(
			connection,
			viewerId,
			avatar
				? this.storage.buildUrl(avatar.storageId, 'thumbnail')
				: null,
		);
	}
}

function stateOf(connection: Connection, viewerId: string): ConnectionState {
	if (connection.status === ConnectionStatus.Accepted) return 'connected';
	if (connection.status === ConnectionStatus.Declined) return 'declined';

	return connection.requesterId === viewerId
		? 'outgoing_pending'
		: 'incoming_pending';
}
