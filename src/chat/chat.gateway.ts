import { Inject, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
	OnGatewayConnection,
	OnGatewayDisconnect,
	SubscribeMessage,
	WebSocketGateway,
	WebSocketServer,
} from '@nestjs/websockets';
import { InjectRepository } from '@nestjs/typeorm';
import { Server, Socket } from 'socket.io';
import { Repository } from 'typeorm';

import { authConfig } from '../config/configuration';
import { PresenceRegistry } from '../presence/presence-registry';
import type { AccessTokenPayload } from '../auth/token-payload';
import { ConversationParticipant } from './entities/conversation-participant.entity';
import type { MessageResponseDto } from './dto/message-response.dto';

/** Sent to everyone in a thread except the author, who already has it. */
export const MESSAGE_CREATED = 'message.created';

/** The other party is composing. Never persisted: it is only true while it is true. */
export const TYPING = 'conversation.typing';

/** The other party has read up to a moment, so delivered ticks can become read ticks. */
export const READ = 'conversation.read';

/** Something happened that the account should be told about, wherever it is in the app. */
export const NOTIFICATION_CREATED = 'notification.created';

/** Room per thread, so a broadcast never reaches an account outside it. */
const roomFor = (conversationId: string) => `conversation:${conversationId}`;

/**
 * Room per account, joined at the handshake. A notification is addressed to a
 * person rather than to a thread, so it cannot use the conversation rooms: the
 * recipient is usually not looking at the thread when it arrives, and may not
 * have joined it at all this session.
 */
const userRoomFor = (userId: string) => `user:${userId}`;

type AuthedSocket = Socket & { userId?: string };

/**
 * Delivery only. The REST endpoints remain the source of truth for reading and
 * writing, so a client with no socket, or a dropped one, still works by
 * refetching. That is deliberate: mobile connections drop constantly, and a
 * transport that has to be up for the app to function is a transport that will
 * fail in the field.
 */
@WebSocketGateway({ namespace: '/chat', cors: { origin: '*' } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
	private readonly logger = new Logger(ChatGateway.name);

	@WebSocketServer()
	private server!: Server;

	constructor(
		@InjectRepository(ConversationParticipant)
		private readonly participants: Repository<ConversationParticipant>,
		private readonly jwt: JwtService,
		private readonly presence: PresenceRegistry,
		@Inject(authConfig.KEY)
		private readonly config: ConfigType<typeof authConfig>,
	) {}

	/**
	 * The handshake carries the same access token the REST calls use. An
	 * unauthenticated socket is disconnected rather than left open and idle,
	 * since there is nothing it may legitimately do.
	 */
	handleConnection(client: AuthedSocket): void {
		const token = client.handshake.auth?.token as unknown;

		if (typeof token !== 'string') {
			client.disconnect(true);
			return;
		}

		try {
			const payload = this.jwt.verify<AccessTokenPayload>(token, {
				secret: this.config.accessSecret,
			});

			client.userId = payload.sub;
			void client.join(userRoomFor(payload.sub));
			this.presence.add(payload.sub);
		} catch {
			client.disconnect(true);
		}
	}

	handleDisconnect(client: AuthedSocket): void {
		if (!client.userId) return;

		this.presence.remove(client.userId);
		this.logger.debug(`socket left: ${client.userId}`);
	}

	/**
	 * Membership is re-checked here rather than trusted from the client: a room
	 * name is guessable, and joining one is what decides who receives a thread's
	 * messages.
	 */
	@SubscribeMessage('conversation.join')
	async join(
		client: AuthedSocket,
		conversationId: unknown,
	): Promise<{ joined: boolean }> {
		if (!client.userId || typeof conversationId !== 'string') {
			return { joined: false };
		}

		const member = await this.participants.exists({
			where: { conversationId, userId: client.userId },
		});

		if (!member) return { joined: false };

		await client.join(roomFor(conversationId));

		return { joined: true };
	}

	@SubscribeMessage('conversation.leave')
	async leave(
		client: AuthedSocket,
		conversationId: unknown,
	): Promise<{ left: boolean }> {
		if (typeof conversationId !== 'string') return { left: false };

		await client.leave(roomFor(conversationId));

		return { left: true };
	}

	/**
	 * Relayed rather than stored. A typing flag is only meaningful while the
	 * socket carrying it is open, so there is nothing worth persisting and
	 * nothing to reconcile after a reconnect.
	 */
	@SubscribeMessage('conversation.typing')
	typing(
		client: AuthedSocket,
		payload: { conversationId?: unknown; isTyping?: unknown },
	): void {
		const { conversationId, isTyping } = payload ?? {};

		if (!client.userId || typeof conversationId !== 'string') return;

		// `broadcast` excludes the sender, who does not need telling.
		client.broadcast.to(roomFor(conversationId)).emit(TYPING, {
			conversationId,
			userId: client.userId,
			isTyping: isTyping === true,
		});
	}

	/**
	 * Lets the other party's ticks catch up without them polling. The read
	 * position itself is written over REST; this only announces it.
	 */
	broadcastRead(
		conversationId: string,
		readerId: string,
		lastReadAt: Date,
	): void {
		this.server?.to(roomFor(conversationId)).emit(READ, {
			conversationId,
			readerId,
			lastReadAt,
		});
	}

	/**
	 * `message` is shaped for the sender, whose `isMine` is true. Recipients are
	 * the other party by definition, so it is inverted on the way out rather
	 * than recomputed per socket.
	 */
	broadcastMessage(
		conversationId: string,
		senderId: string,
		message: MessageResponseDto,
	): void {
		this.server?.to(roomFor(conversationId)).emit(MESSAGE_CREATED, {
			conversationId,
			senderId,
			message: { ...message, isMine: false },
		});
	}

	/**
	 * Addressed to one account rather than a thread, so the bell updates
	 * wherever they are in the app. Typed loosely because the payload belongs
	 * to the notifications module, and importing its DTO here would put chat
	 * and notifications in a cycle.
	 */
	broadcastNotification(userId: string, notification: unknown): void {
		this.server?.to(userRoomFor(userId)).emit(NOTIFICATION_CREATED, {
			notification,
		});
	}
}
