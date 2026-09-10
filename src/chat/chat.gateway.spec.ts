import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { authConfig } from '../config/configuration';
import { PresenceRegistry } from '../presence/presence-registry';
import { ChatGateway, MESSAGE_CREATED, READ, TYPING } from './chat.gateway';
import { ConversationParticipant } from './entities/conversation-participant.entity';
import { MessageKind } from './entities/message-kind.enum';
import type { MessageResponseDto } from './dto/message-response.dto';

const VIEWER = '5c1a0b2d-0000-4000-8000-000000000001';
const CONVERSATION = '5c1a0b2d-0000-4000-8000-0000000000cc';

const socket = (token?: unknown) => {
	const broadcastEmit = jest.fn();

	return {
		handshake: { auth: token === undefined ? {} : { token } },
		disconnect: jest.fn(),
		join: jest.fn().mockResolvedValue(undefined),
		leave: jest.fn().mockResolvedValue(undefined),
		broadcast: { to: () => ({ emit: broadcastEmit }) },
		broadcastEmit,
	};
};

describe('ChatGateway', () => {
	let gateway: ChatGateway;
	let participants: Record<string, jest.Mock>;
	let jwt: Record<string, jest.Mock>;
	let emit: jest.Mock;
	let registry: PresenceRegistry;

	beforeEach(async () => {
		participants = { exists: jest.fn().mockResolvedValue(true) };
		jwt = { verify: jest.fn().mockReturnValue({ sub: VIEWER }) };
		emit = jest.fn();
		registry = new PresenceRegistry();

		const moduleRef = await Test.createTestingModule({
			providers: [
				ChatGateway,
				{
					provide: getRepositoryToken(ConversationParticipant),
					useValue: participants,
				},
				{ provide: JwtService, useValue: jwt },
				{ provide: PresenceRegistry, useValue: registry },
				{
					provide: authConfig.KEY,
					useValue: { accessSecret: 'secret' },
				},
			],
		}).compile();

		gateway = moduleRef.get(ChatGateway);
		Object.assign(gateway, { server: { to: () => ({ emit }) } });
	});

	describe('handleConnection', () => {
		it('drops a socket that presents no token', () => {
			const client = socket();

			gateway.handleConnection(client as never);

			expect(client.disconnect).toHaveBeenCalledWith(true);
		});

		it('drops a socket whose token does not verify', () => {
			jwt.verify.mockImplementation(() => {
				throw new Error('bad signature');
			});
			const client = socket('forged');

			gateway.handleConnection(client as never);

			expect(client.disconnect).toHaveBeenCalledWith(true);
		});

		it('keeps a socket presenting a valid token', () => {
			const client = socket('good');

			gateway.handleConnection(client as never);

			expect(client.disconnect).not.toHaveBeenCalled();
		});

		it('reports the account online for as long as its socket is open', () => {
			const client = socket('good');

			gateway.handleConnection(client as never);
			expect(registry.isConnected(VIEWER)).toBe(true);

			gateway.handleDisconnect(client as never);
			expect(registry.isConnected(VIEWER)).toBe(false);
		});

		it('does not report a rejected socket as online', () => {
			jwt.verify.mockImplementation(() => {
				throw new Error('bad signature');
			});

			gateway.handleConnection(socket('forged') as never);

			expect(registry.isConnected(VIEWER)).toBe(false);
		});
	});

	describe('join', () => {
		it('refuses a thread the account is not part of, since rooms are guessable', async () => {
			participants.exists.mockResolvedValue(false);
			const client = socket('good');
			gateway.handleConnection(client as never);

			const result = await gateway.join(client as never, CONVERSATION);

			expect(result).toEqual({ joined: false });
			expect(client.join).not.toHaveBeenCalled();
		});

		it('refuses an unauthenticated socket outright', async () => {
			const client = socket();

			const result = await gateway.join(client as never, CONVERSATION);

			expect(result).toEqual({ joined: false });
			expect(participants.exists).not.toHaveBeenCalled();
		});

		it('joins a member to the thread room', async () => {
			const client = socket('good');
			gateway.handleConnection(client as never);

			const result = await gateway.join(client as never, CONVERSATION);

			expect(result).toEqual({ joined: true });
			expect(client.join).toHaveBeenCalledWith(
				`conversation:${CONVERSATION}`,
			);
		});
	});

	describe('typing', () => {
		it('relays to the rest of the thread, never back to the sender', () => {
			const client = socket('good');
			gateway.handleConnection(client as never);

			gateway.typing(client as never, {
				conversationId: CONVERSATION,
				isTyping: true,
			});

			expect(client.broadcastEmit).toHaveBeenCalledWith(TYPING, {
				conversationId: CONVERSATION,
				userId: VIEWER,
				isTyping: true,
			});
		});

		it('coerces a missing flag to not typing rather than passing it through', () => {
			const client = socket('good');
			gateway.handleConnection(client as never);

			gateway.typing(client as never, { conversationId: CONVERSATION });

			expect(client.broadcastEmit).toHaveBeenCalledWith(
				TYPING,
				expect.objectContaining({ isTyping: false }),
			);
		});

		it('ignores an unauthenticated socket', () => {
			const client = socket();

			gateway.typing(client as never, {
				conversationId: CONVERSATION,
				isTyping: true,
			});

			expect(client.broadcastEmit).not.toHaveBeenCalled();
		});
	});

	describe('broadcastRead', () => {
		it('announces the reader and how far they have read', () => {
			const lastReadAt = new Date('2026-09-08T17:00:00Z');

			gateway.broadcastRead(CONVERSATION, VIEWER, lastReadAt);

			expect(emit).toHaveBeenCalledWith(READ, {
				conversationId: CONVERSATION,
				readerId: VIEWER,
				lastReadAt,
			});
		});
	});

	describe('broadcastMessage', () => {
		it('inverts isMine, because every recipient is the other party', () => {
			const message = {
				id: 'm1',
				kind: MessageKind.Text,
				body: 'hi',
				mediaUrl: null,
				isMine: true,
				createdAt: new Date('2026-09-08T12:00:00Z'),
			} as MessageResponseDto;

			gateway.broadcastMessage(CONVERSATION, VIEWER, message);

			expect(emit).toHaveBeenCalledWith(MESSAGE_CREATED, {
				conversationId: CONVERSATION,
				senderId: VIEWER,
				message: { ...message, isMine: false },
			});
		});
	});
});
