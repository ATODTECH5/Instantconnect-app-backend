import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { ChatGateway } from '../chat/chat.gateway';
import { ChatService } from '../chat/chat.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Storage } from '../storage/storage';
import { User } from '../users/entities/user.entity';
import { ConnectionsService } from './connections.service';
import { Connection } from './entities/connection.entity';
import { ConnectionStatus } from './entities/connection-status.enum';

const VIEWER = '9f1c0d2e-0000-4000-8000-000000000001';
const OTHER = '9f1c0d2e-0000-4000-8000-000000000002';
const CONNECTION_ID = '9f1c0d2e-0000-4000-8000-0000000000ff';

const party = (id: string) =>
	({
		id,
		fullName: 'Someone',
		locationLabel: null,
		photos: [],
	}) as unknown as User;

const connection = (overrides: Partial<Connection> = {}): Connection =>
	Object.assign(new Connection(), {
		id: CONNECTION_ID,
		requesterId: VIEWER,
		addresseeId: OTHER,
		requester: party(VIEWER),
		addressee: party(OTHER),
		status: ConnectionStatus.Pending,
		respondedAt: null,
		createdAt: new Date('2026-08-30T00:00:00Z'),
		...overrides,
	});

const codeOf = (error: unknown): string =>
	((error as { response: { code: string } }).response ?? {}).code;

describe('ConnectionsService', () => {
	let service: ConnectionsService;
	let connections: Record<string, jest.Mock>;
	let users: Record<string, jest.Mock>;
	let chat: { createForConnection: jest.Mock };

	beforeEach(async () => {
		connections = {
			findOne: jest.fn().mockResolvedValue(null),
			find: jest.fn().mockResolvedValue([]),
			findAndCount: jest.fn().mockResolvedValue([[], 0]),
			count: jest.fn().mockResolvedValue(0),
			create: jest.fn((value: unknown) => value),
			save: jest.fn(() => Promise.resolve(connection())),
		};

		users = { findOne: jest.fn().mockResolvedValue({ id: OTHER }) };
		chat = { createForConnection: jest.fn().mockResolvedValue(undefined) };

		const moduleRef = await Test.createTestingModule({
			providers: [
				ConnectionsService,
				{
					provide: getRepositoryToken(Connection),
					useValue: connections,
				},
				{ provide: getRepositoryToken(User), useValue: users },
				{
					provide: Storage,
					useValue: { buildUrl: () => 'https://cdn/a' },
				},
				{ provide: ChatService, useValue: chat },
				{
					provide: NotificationsService,
					useValue: { create: jest.fn().mockResolvedValue({}) },
				},
				{
					provide: ChatGateway,
					useValue: { broadcastNotification: jest.fn() },
				},
			],
		}).compile();

		service = moduleRef.get(ConnectionsService);
	});

	describe('request', () => {
		it('refuses a request to yourself', async () => {
			await expect(
				service.request(VIEWER, VIEWER),
			).rejects.toBeInstanceOf(BadRequestException);
		});

		it('refuses a request to somebody who is not an active account', async () => {
			users.findOne.mockResolvedValue(null);

			await expect(service.request(VIEWER, OTHER)).rejects.toBeInstanceOf(
				NotFoundException,
			);
		});

		it('creates a pending request when there is no existing pair', async () => {
			connections.findOne
				.mockResolvedValueOnce(null)
				.mockResolvedValueOnce(connection());

			const result = await service.request(VIEWER, OTHER);

			expect(connections.save).toHaveBeenCalledTimes(1);
			expect(result.status).toBe(ConnectionStatus.Pending);
			expect(result.isOutgoing).toBe(true);
			expect(result.party.id).toBe(OTHER);
		});

		it.each([
			[
				'an accepted pair',
				{ status: ConnectionStatus.Accepted },
				'ALREADY_CONNECTED',
			],
			[
				'a pair the viewer already asked',
				{ status: ConnectionStatus.Pending },
				'REQUEST_ALREADY_SENT',
			],
			[
				'a pair the other person asked first',
				{
					status: ConnectionStatus.Pending,
					requesterId: OTHER,
					addresseeId: VIEWER,
				},
				'REQUEST_ALREADY_RECEIVED',
			],
			[
				'a declined pair',
				{ status: ConnectionStatus.Declined },
				'REQUEST_DECLINED',
			],
		])('rejects %s with %#', async (_label, overrides, expected) => {
			connections.findOne.mockResolvedValueOnce(connection(overrides));

			const error = await service
				.request(VIEWER, OTHER)
				.catch((e: unknown) => e);

			expect(error).toBeInstanceOf(ConflictException);
			expect(codeOf(error)).toBe(expected);
			expect(connections.save).not.toHaveBeenCalled();
		});
	});

	describe('respond', () => {
		it('lets the addressee accept a pending request', async () => {
			connections.findOne.mockResolvedValue(
				connection({ requesterId: OTHER, addresseeId: VIEWER }),
			);
			connections.save.mockImplementation((value: Connection) =>
				Promise.resolve(value),
			);

			const result = await service.respond(
				VIEWER,
				CONNECTION_ID,
				ConnectionStatus.Accepted,
			);

			expect(result.status).toBe(ConnectionStatus.Accepted);
			expect(result.respondedAt).toBeInstanceOf(Date);
			expect(result.isOutgoing).toBe(false);
		});

		it('opens a thread for both parties on accept', async () => {
			connections.findOne.mockResolvedValue(
				connection({ requesterId: OTHER, addresseeId: VIEWER }),
			);
			connections.save.mockImplementation((value: Connection) =>
				Promise.resolve(value),
			);

			await service.respond(
				VIEWER,
				CONNECTION_ID,
				ConnectionStatus.Accepted,
			);

			expect(chat.createForConnection).toHaveBeenCalledWith(
				CONNECTION_ID,
				[OTHER, VIEWER],
			);
		});

		it('opens no thread when the request is declined', async () => {
			connections.findOne.mockResolvedValue(
				connection({ requesterId: OTHER, addresseeId: VIEWER }),
			);
			connections.save.mockImplementation((value: Connection) =>
				Promise.resolve(value),
			);

			await service.respond(
				VIEWER,
				CONNECTION_ID,
				ConnectionStatus.Declined,
			);

			expect(chat.createForConnection).not.toHaveBeenCalled();
		});

		it('refuses the requester answering their own request', async () => {
			connections.findOne.mockResolvedValue(connection());

			await expect(
				service.respond(
					VIEWER,
					CONNECTION_ID,
					ConnectionStatus.Accepted,
				),
			).rejects.toBeInstanceOf(ForbiddenException);
		});

		it('refuses a second answer', async () => {
			connections.findOne.mockResolvedValue(
				connection({
					requesterId: OTHER,
					addresseeId: VIEWER,
					status: ConnectionStatus.Accepted,
				}),
			);

			await expect(
				service.respond(
					VIEWER,
					CONNECTION_ID,
					ConnectionStatus.Declined,
				),
			).rejects.toBeInstanceOf(ConflictException);
		});

		it('reports a connection that no longer exists', async () => {
			connections.findOne.mockResolvedValue(null);

			await expect(
				service.respond(
					VIEWER,
					CONNECTION_ID,
					ConnectionStatus.Accepted,
				),
			).rejects.toBeInstanceOf(NotFoundException);
		});
	});

	describe('statesFor', () => {
		it('does not query when there is nobody to look up', async () => {
			expect(await service.statesFor(VIEWER, [])).toEqual(new Map());
			expect(connections.find).not.toHaveBeenCalled();
		});

		it('reports each pair from the viewer’s side', async () => {
			connections.find.mockResolvedValue([
				connection({
					addresseeId: OTHER,
					status: ConnectionStatus.Accepted,
				}),
				connection({
					requesterId: 'other-2',
					addresseeId: VIEWER,
					status: ConnectionStatus.Pending,
				}),
				connection({
					addresseeId: 'other-3',
					status: ConnectionStatus.Declined,
				}),
			]);

			const states = await service.statesFor(VIEWER, [
				OTHER,
				'other-2',
				'other-3',
			]);

			expect(states.get(OTHER)).toBe('connected');
			expect(states.get('other-2')).toBe('incoming_pending');
			expect(states.get('other-3')).toBe('declined');
			expect(states.get('nobody')).toBeUndefined();
		});
	});
});
