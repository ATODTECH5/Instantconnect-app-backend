import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Not, Repository } from 'typeorm';

import { PageInfoDto } from '../common/dto/pagination.dto';
import type { PaginationQueryDto } from '../common/dto/pagination.dto';
import { onlineSince } from '../presence/online-window';
import { PresenceRegistry } from '../presence/presence-registry';
import { ChatGateway } from './chat.gateway';
import { Storage } from '../storage/storage';
import { AVATAR_POSITION } from '../users/entities/user-photo.entity';
import {
	ConversationPageDto,
	ConversationPartyDto,
	ConversationPreviewDto,
	ConversationResponseDto,
} from './dto/conversation-response.dto';
import type { ListConversationsQueryDto } from './dto/list-conversations-query.dto';
import { MessagePageDto, MessageResponseDto } from './dto/message-response.dto';
import { ReadReceiptDto } from './dto/read-receipt.dto';
import { ConversationParticipant } from './entities/conversation-participant.entity';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { MessageKind } from './entities/message-kind.enum';

/**
 * True when the thread holds a message the viewer has not read. Written against
 * the query builder's aliases rather than as an entity condition, because it
 * compares two tables' columns and TypeORM has no expression for that.
 */
const HAS_UNREAD = `EXISTS (
	SELECT 1 FROM "messages" unread
	WHERE unread."conversationId" = conversation."id"
		AND unread."senderId" <> party."userId"
		AND (party."lastReadAt" IS NULL OR unread."createdAt" > party."lastReadAt")
)`;

@Injectable()
export class ChatService {
	constructor(
		@InjectRepository(Conversation)
		private readonly conversations: Repository<Conversation>,
		@InjectRepository(ConversationParticipant)
		private readonly participants: Repository<ConversationParticipant>,
		@InjectRepository(Message)
		private readonly messages: Repository<Message>,
		private readonly storage: Storage,
		private readonly dataSource: DataSource,
		private readonly gateway: ChatGateway,
		private readonly presence: PresenceRegistry,
	) {}

	/**
	 * Called when a connection is accepted. Idempotent, because accepting is
	 * guarded against replay but a backfilled pair may already have a thread.
	 */
	async createForConnection(
		connectionId: string,
		partyIds: [string, string],
	): Promise<void> {
		await this.conversations
			.createQueryBuilder()
			.insert()
			.values({ id: connectionId })
			.orIgnore()
			.execute();

		await this.participants
			.createQueryBuilder()
			.insert()
			.values(
				partyIds.map((userId) => ({
					conversationId: connectionId,
					userId,
				})),
			)
			.orIgnore()
			.execute();
	}

	async listConversations(
		viewerId: string,
		query: ListConversationsQueryDto,
	): Promise<ConversationPageDto> {
		const base = this.participants
			.createQueryBuilder('party')
			.innerJoinAndSelect('party.conversation', 'conversation')
			.where('party.userId = :viewerId', { viewerId });

		if (query.favouritesOnly) base.andWhere('party.isFavourite = true');
		if (query.unreadOnly) base.andWhere(HAS_UNREAD);

		const total = await base.getCount();

		if (total === 0) {
			return new ConversationPageDto([], new PageInfoDto(0, query), 0);
		}

		const rows = await base
			.clone()
			.orderBy('conversation.lastMessageAt', 'DESC', 'NULLS LAST')
			.addOrderBy('conversation.id', 'ASC')
			.take(query.limit)
			.skip(query.offset)
			.getMany();

		const ids = rows.map((row) => row.conversationId);
		const [parties, previews, unread, unreadThreads] = await Promise.all([
			this.partiesFor(viewerId, ids),
			this.lastMessagesFor(ids),
			this.unreadCountsFor(viewerId, ids),
			this.countUnreadThreads(viewerId),
		]);

		const items = rows.flatMap((row) => {
			const party = parties.get(row.conversationId);

			// A thread whose other party has been deleted has nothing to show.
			if (!party) return [];

			const preview = previews.get(row.conversationId);

			return [
				new ConversationResponseDto(
					row.conversation,
					party.dto,
					preview
						? new ConversationPreviewDto(
								preview,
								viewerId,
								party.dto.fullName.split(' ')[0],
							)
						: null,
					unread.get(row.conversationId) ?? 0,
					row.isFavourite,
					party.lastReadAt,
				),
			];
		});

		return new ConversationPageDto(
			items,
			new PageInfoDto(total, query),
			unreadThreads,
		);
	}

	async listMessages(
		viewerId: string,
		conversationId: string,
		query: PaginationQueryDto,
	): Promise<MessagePageDto> {
		await this.membershipOrThrow(viewerId, conversationId);

		const [[rows, total], other] = await Promise.all([
			this.messages.findAndCount({
				where: { conversationId },
				order: { createdAt: 'DESC', id: 'DESC' },
				take: query.limit,
				skip: query.offset,
			}),
			this.participants.findOne({
				where: { conversationId, userId: Not(viewerId) },
				select: { id: true, lastReadAt: true },
			}),
		]);

		return new MessagePageDto(
			rows.map((row) => this.toMessage(row, viewerId)),
			new PageInfoDto(total, query),
			other?.lastReadAt ?? null,
		);
	}

	/**
	 * The insert and the ordering key move together: a message the chat list
	 * cannot order is worse than no message, so both or neither.
	 */
	async sendMessage(
		viewerId: string,
		conversationId: string,
		body: string,
	): Promise<MessageResponseDto> {
		await this.membershipOrThrow(viewerId, conversationId);

		const saved = await this.dataSource.transaction(async (manager) => {
			const message = await manager.save(
				manager.create(Message, {
					conversationId,
					senderId: viewerId,
					kind: MessageKind.Text,
					body,
				}),
			);

			await manager.update(
				Conversation,
				{ id: conversationId },
				{ lastMessageAt: message.createdAt },
			);

			return message;
		});

		const response = this.toMessage(saved, viewerId);

		// After the transaction, never inside it: a broadcast cannot be rolled
		// back, and announcing a message that was then rolled back is worse
		// than announcing one late.
		this.gateway.broadcastMessage(conversationId, viewerId, response);

		return response;
	}

	/**
	 * Reads up to now rather than up to a message id the client names. A message
	 * that lands in the gap between render and this call is marked read without
	 * having been seen, which is the same trade every chat app makes.
	 */
	async markRead(
		viewerId: string,
		conversationId: string,
	): Promise<ReadReceiptDto> {
		const party = await this.membershipOrThrow(viewerId, conversationId);
		const lastReadAt = new Date();

		await this.participants.update({ id: party.id }, { lastReadAt });

		// Lets the other party's ticks catch up without them polling for it.
		this.gateway.broadcastRead(conversationId, viewerId, lastReadAt);

		return new ReadReceiptDto(conversationId, lastReadAt);
	}

	async setFavourite(
		viewerId: string,
		conversationId: string,
		isFavourite: boolean,
	): Promise<{ id: string; isFavourite: boolean }> {
		const party = await this.membershipOrThrow(viewerId, conversationId);

		await this.participants.update({ id: party.id }, { isFavourite });

		return { id: conversationId, isFavourite };
	}

	/**
	 * Membership is the authorisation. A non member gets the same answer as
	 * someone asking for a thread that does not exist, so the endpoint cannot be
	 * used to discover who talks to whom.
	 */
	private async membershipOrThrow(
		viewerId: string,
		conversationId: string,
	): Promise<ConversationParticipant> {
		const party = await this.participants.findOne({
			where: { conversationId, userId: viewerId },
		});

		if (!party) {
			throw new NotFoundException({
				code: 'CONVERSATION_NOT_FOUND',
				message: 'That conversation is not available.',
			});
		}

		return party;
	}

	private async partiesFor(
		viewerId: string,
		conversationIds: string[],
	): Promise<
		Map<string, { dto: ConversationPartyDto; lastReadAt: Date | null }>
	> {
		const rows = await this.participants.find({
			where: { conversationId: In(conversationIds) },
			relations: { user: { photos: true } },
		});

		const since = onlineSince();

		return new Map(
			rows
				.filter((row) => row.userId !== viewerId && row.user)
				.map((row) => {
					const avatar = row.user.photos?.find(
						(photo) => photo.position === AVATAR_POSITION,
					);

					return [
						row.conversationId,
						{
							dto: new ConversationPartyDto(
								row.user,
								avatar
									? this.storage.buildUrl(
											avatar.storageId,
											'thumbnail',
										)
									: null,
								this.presence.isOnline(
									row.userId,
									row.user.lastActiveAt,
									since,
								),
							),
							lastReadAt: row.lastReadAt,
						},
					];
				}),
		);
	}

	/** One row per thread, newest first, in a single pass rather than per card. */
	private async lastMessagesFor(
		conversationIds: string[],
	): Promise<Map<string, Message>> {
		const rows = await this.messages
			.createQueryBuilder('message')
			.distinctOn(['message.conversationId'])
			.where('message.conversationId IN (:...conversationIds)', {
				conversationIds,
			})
			.orderBy('message.conversationId', 'ASC')
			.addOrderBy('message.createdAt', 'DESC')
			.getMany();

		return new Map(rows.map((row) => [row.conversationId, row]));
	}

	private async unreadCountsFor(
		viewerId: string,
		conversationIds: string[],
	): Promise<Map<string, number>> {
		const rows = await this.messages
			.createQueryBuilder('message')
			.select('message.conversationId', 'conversationId')
			.addSelect('COUNT(*)', 'count')
			.innerJoin(
				ConversationParticipant,
				'party',
				'party."conversationId" = message."conversationId" AND party."userId" = :viewerId',
				{ viewerId },
			)
			.where('message.conversationId IN (:...conversationIds)', {
				conversationIds,
			})
			.andWhere('message.senderId <> :viewerId', { viewerId })
			.andWhere(
				'(party."lastReadAt" IS NULL OR message."createdAt" > party."lastReadAt")',
			)
			.groupBy('message.conversationId')
			.getRawMany<{ conversationId: string; count: string }>();

		return new Map(
			rows.map((row) => [row.conversationId, Number(row.count)]),
		);
	}

	private countUnreadThreads(viewerId: string): Promise<number> {
		return this.participants
			.createQueryBuilder('party')
			.innerJoin('party.conversation', 'conversation')
			.where('party.userId = :viewerId', { viewerId })
			.andWhere(HAS_UNREAD)
			.getCount();
	}

	private toMessage(message: Message, viewerId: string): MessageResponseDto {
		return new MessageResponseDto(
			message,
			viewerId,
			message.mediaStorageId
				? this.storage.buildUrl(message.mediaStorageId, 'full')
				: null,
		);
	}
}
