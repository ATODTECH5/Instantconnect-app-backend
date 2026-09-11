import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { Storage } from '../storage/storage';
import { PresenceRegistry } from '../presence/presence-registry';
import { ChatGateway } from './chat.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { ChatService } from './chat.service';
import { ConversationPreviewDto } from './dto/conversation-response.dto';
import { ConversationParticipant } from './entities/conversation-participant.entity';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { MessageKind } from './entities/message-kind.enum';

const VIEWER = '7a2b0c1d-0000-4000-8000-000000000001';
const OTHER = '7a2b0c1d-0000-4000-8000-000000000002';
const CONVERSATION = '7a2b0c1d-0000-4000-8000-0000000000aa';

const codeOf = (error: unknown): string =>
	((error as { response: { code: string } }).response ?? {}).code;

const membership = (
	overrides: Partial<ConversationParticipant> = {},
): ConversationParticipant =>
	Object.assign(new ConversationParticipant(), {
		id: 'party-1',
		conversationId: CONVERSATION,
		userId: VIEWER,
		isFavourite: false,
		lastReadAt: null,
		...overrides,
	});

const message = (overrides: Partial<Message> = {}): Message =>
	Object.assign(new Message(), {
		id: 'message-1',
		conversationId: CONVERSATION,
		senderId: VIEWER,
		kind: MessageKind.Text,
		body: 'Hello, how are you?',
		mediaStorageId: null,
		createdAt: new Date('2026-09-08T07:56:00Z'),
		...overrides,
	});

describe('ChatService', () => {
	let service: ChatService;
	let conversations: Record<string, jest.Mock>;
	let participants: Record<string, jest.Mock>;
	let messages: Record<string, jest.Mock>;
	let manager: Record<string, jest.Mock>;
	let gateway: { broadcastMessage: jest.Mock; broadcastRead: jest.Mock };

	beforeEach(async () => {
		conversations = { createQueryBuilder: jest.fn() };
		participants = {
			findOne: jest.fn().mockResolvedValue(membership()),
			find: jest.fn().mockResolvedValue([]),
			update: jest.fn().mockResolvedValue(undefined),
			createQueryBuilder: jest.fn(),
		};
		messages = {
			findAndCount: jest.fn().mockResolvedValue([[], 0]),
			createQueryBuilder: jest.fn(),
		};

		gateway = { broadcastMessage: jest.fn(), broadcastRead: jest.fn() };

		manager = {
			create: jest.fn((_entity: unknown, value: unknown) => value),
			save: jest.fn((value: Partial<Message>) =>
				Promise.resolve(message(value)),
			),
			update: jest.fn().mockResolvedValue(undefined),
		};

		const moduleRef = await Test.createTestingModule({
			providers: [
				ChatService,
				{
					provide: getRepositoryToken(Conversation),
					useValue: conversations,
				},
				{
					provide: getRepositoryToken(ConversationParticipant),
					useValue: participants,
				},
				{ provide: getRepositoryToken(Message), useValue: messages },
				{
					provide: Storage,
					useValue: { buildUrl: () => 'https://cdn/a' },
				},
				{ provide: ChatGateway, useValue: gateway },
				{
					provide: NotificationsService,
					useValue: { create: jest.fn().mockResolvedValue({}) },
				},
				{ provide: PresenceRegistry, useValue: new PresenceRegistry() },
				{
					provide: DataSource,
					useValue: {
						transaction: (work: (m: unknown) => unknown) =>
							work(manager),
					},
				},
			],
		}).compile();

		service = moduleRef.get(ChatService);
	});

	describe('membership', () => {
		it.each([
			[
				'reading a thread',
				() =>
					service.listMessages(VIEWER, CONVERSATION, {
						limit: 20,
						offset: 0,
					}),
			],
			[
				'sending to a thread',
				() => service.sendMessage(VIEWER, CONVERSATION, { body: 'hi' }),
			],
			[
				'marking a thread read',
				() => service.markRead(VIEWER, CONVERSATION),
			],
			[
				'favouriting a thread',
				() => service.setFavourite(VIEWER, CONVERSATION, true),
			],
		])('refuses %s the account is not part of', async (_label, act) => {
			participants.findOne.mockResolvedValue(null);

			await expect(act()).rejects.toBeInstanceOf(NotFoundException);
		});

		it('reports a thread it cannot see as missing rather than forbidden', async () => {
			participants.findOne.mockResolvedValue(null);

			const error = await service
				.markRead(VIEWER, CONVERSATION)
				.catch((cause: unknown) => cause);

			expect(codeOf(error)).toBe('CONVERSATION_NOT_FOUND');
		});
	});

	describe('sendMessage', () => {
		it('stores the message and moves the ordering key with it', async () => {
			const result = await service.sendMessage(VIEWER, CONVERSATION, {
				body: 'Hello, how are you?',
			});

			expect(manager.update).toHaveBeenCalledWith(
				Conversation,
				{ id: CONVERSATION },
				{ lastMessageAt: result.createdAt },
			);
			expect(result.body).toBe('Hello, how are you?');
			expect(result.kind).toBe(MessageKind.Text);
			expect(result.isMine).toBe(true);
		});

		it('announces the message to the thread once it is stored', async () => {
			const result = await service.sendMessage(VIEWER, CONVERSATION, {
				body: 'Hello, how are you?',
			});

			expect(gateway.broadcastMessage).toHaveBeenCalledWith(
				CONVERSATION,
				VIEWER,
				result,
			);
		});

		it('does not announce a message that failed to store', async () => {
			manager.save.mockRejectedValue(new Error('write failed'));

			await expect(
				service.sendMessage(VIEWER, CONVERSATION, { body: 'hi' }),
			).rejects.toThrow();

			expect(gateway.broadcastMessage).not.toHaveBeenCalled();
		});
	});

	describe('listMessages', () => {
		it('marks the other party’s messages as not the viewer’s', async () => {
			messages.findAndCount.mockResolvedValue([
				[message({ senderId: OTHER }), message()],
				2,
			]);

			const page = await service.listMessages(VIEWER, CONVERSATION, {
				limit: 20,
				offset: 0,
			});

			expect(page.items.map((item) => item.isMine)).toEqual([
				false,
				true,
			]);
			expect(page.page.total).toBe(2);
		});

		it('resolves a delivery url only for messages that carry media', async () => {
			messages.findAndCount.mockResolvedValue([
				[
					message({
						kind: MessageKind.Image,
						body: null,
						mediaStorageId: 'abc',
					}),
					message(),
				],
				2,
			]);

			const page = await service.listMessages(VIEWER, CONVERSATION, {
				limit: 20,
				offset: 0,
			});

			expect(page.items[0].mediaUrl).toBe('https://cdn/a');
			expect(page.items[1].mediaUrl).toBeNull();
		});
	});

	describe('markRead', () => {
		it('advances the viewer’s own read position, not the thread’s', async () => {
			const receipt = await service.markRead(VIEWER, CONVERSATION);

			expect(participants.update).toHaveBeenCalledWith(
				{ id: 'party-1' },
				{ lastReadAt: receipt.lastReadAt },
			);
		});

		it('tells the thread, so the other party’s ticks can catch up', async () => {
			const receipt = await service.markRead(VIEWER, CONVERSATION);

			expect(gateway.broadcastRead).toHaveBeenCalledWith(
				CONVERSATION,
				VIEWER,
				receipt.lastReadAt,
			);
		});
	});

	describe('listConversations', () => {
		it('does not go looking for parties or previews when there are none', async () => {
			const builder = {
				innerJoinAndSelect: jest.fn().mockReturnThis(),
				where: jest.fn().mockReturnThis(),
				andWhere: jest.fn().mockReturnThis(),
				getCount: jest.fn().mockResolvedValue(0),
				clone: jest.fn(),
			};
			participants.createQueryBuilder.mockReturnValue(builder);

			const page = await service.listConversations(VIEWER, {
				limit: 20,
				offset: 0,
			});

			expect(page.items).toEqual([]);
			expect(page.unreadThreads).toBe(0);
			expect(builder.clone).not.toHaveBeenCalled();
			expect(participants.find).not.toHaveBeenCalled();
		});
	});

	describe('conversation preview', () => {
		it('describes a photo, since an image message has no body to show', () => {
			const incoming = new ConversationPreviewDto(
				message({
					kind: MessageKind.Image,
					body: null,
					senderId: OTHER,
				}),
				VIEWER,
				'Halima',
			);
			const outgoing = new ConversationPreviewDto(
				message({ kind: MessageKind.Image, body: null }),
				VIEWER,
				'Halima',
			);

			expect(incoming.text).toBe('Halima sent a photo');
			expect(outgoing.text).toBe('You sent a photo');
		});

		it('shows the text of a text message as sent', () => {
			const preview = new ConversationPreviewDto(
				message({ senderId: OTHER }),
				VIEWER,
				'Halima',
			);

			expect(preview.text).toBe('Hello, how are you?');
			expect(preview.isMine).toBe(false);
		});
	});

	describe('setFavourite', () => {
		it('writes the flag on the viewer’s membership row alone', async () => {
			const result = await service.setFavourite(
				VIEWER,
				CONVERSATION,
				true,
			);

			expect(participants.update).toHaveBeenCalledWith(
				{ id: 'party-1' },
				{ isFavourite: true },
			);
			expect(result).toEqual({ id: CONVERSATION, isFavourite: true });
		});
	});
});
