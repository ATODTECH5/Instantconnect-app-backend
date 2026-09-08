import type { DataSource } from 'typeorm';

import { ConversationParticipant } from '../../chat/entities/conversation-participant.entity';
import { Conversation } from '../../chat/entities/conversation.entity';
import { Message } from '../../chat/entities/message.entity';
import { MessageKind } from '../../chat/entities/message-kind.enum';
import { Connection } from '../../connections/entities/connection.entity';
import { ConnectionStatus } from '../../connections/entities/connection-status.enum';
import { User } from '../../users/entities/user.entity';
import { SEED_EMAIL_DOMAIN } from './dev-people';

const MINUTE = 60 * 1000;

type Line = { fromPartner: boolean; body: string };

type Thread = {
	/** How long ago the last line landed, so the list has a believable order. */
	endedMinutesAgo: number;
	readByYou: boolean;
	favouritedByYou: boolean;
	lines: Line[];
};

/**
 * Deliberately varied rather than uniform: the chat list has All, Unread and
 * Favourites chips and a per row unread badge, and a fixture where every thread
 * looks the same exercises none of them. The last thread has no lines at all,
 * which is the state a connection sits in between being accepted and either
 * party saying anything.
 */
const THREADS: Thread[] = [
	{
		endedMinutesAgo: 4,
		readByYou: false,
		favouritedByYou: false,
		lines: [
			{ fromPartner: true, body: 'Hello, how are you?' },
			{
				fromPartner: true,
				body: 'Saw we matched on Business. Are you around Yaba this week?',
			},
		],
	},
	{
		endedMinutesAgo: 90,
		readByYou: false,
		favouritedByYou: true,
		lines: [
			{
				fromPartner: false,
				body: 'Hi! Yes, I run a studio just off Herbert Macaulay.',
			},
			{ fromPartner: true, body: 'Nice field. Do you take walk ins?' },
			{ fromPartner: true, body: 'I could come by Thursday afternoon.' },
		],
	},
	{
		endedMinutesAgo: 5 * 60,
		readByYou: true,
		favouritedByYou: true,
		lines: [
			{ fromPartner: true, body: 'How long have you been singing?' },
			{
				fromPartner: false,
				body: 'About six years now, mostly session work.',
			},
			{
				fromPartner: true,
				body: "That's a while. Would love to hear something.",
			},
		],
	},
	{
		endedMinutesAgo: 30 * 60,
		readByYou: true,
		favouritedByYou: false,
		lines: [
			{
				fromPartner: false,
				body: 'We can discuss better in a work space',
			},
			{
				fromPartner: true,
				body: "It's a cool environment, plenty of quiet corners.",
			},
			{
				fromPartner: false,
				body: 'Perfect. Let me know what suits you.',
			},
			{ fromPartner: true, body: 'Most time I assume' },
		],
	},
	{
		endedMinutesAgo: 12 * 60,
		readByYou: true,
		favouritedByYou: false,
		lines: [],
	},
];

/**
 * Connects the accounts a human registered by hand to the front of the fixture,
 * because a chat list is only worth looking at from an account you can sign in
 * to. Seed people are never connected to each other: nobody can log in as two
 * of them at once, so those threads would be invisible.
 */
export async function seedConversations(
	source: DataSource,
	partners: User[],
): Promise<{ humans: number; threads: number }> {
	const humans = await source
		.getRepository(User)
		.createQueryBuilder('user')
		.where('user.email NOT LIKE :pattern', {
			pattern: `%@${SEED_EMAIL_DOMAIN}`,
		})
		.getMany();

	if (humans.length === 0 || partners.length < THREADS.length) {
		return { humans: humans.length, threads: 0 };
	}

	const connections = source.getRepository(Connection);
	const conversations = source.getRepository(Conversation);
	const participants = source.getRepository(ConversationParticipant);
	const messages = source.getRepository(Message);
	const now = Date.now();

	let threads = 0;

	for (const [humanIndex, human] of humans.entries()) {
		for (const [index, thread] of THREADS.entries()) {
			// Offset per human so two accounts do not fight over one partner.
			const partner = partners[humanIndex * THREADS.length + index];

			if (!partner) continue;

			// The partner asks and the human accepted, which is the direction
			// that puts the thread in the human's list without them doing work.
			const connection = await connections.save(
				connections.create({
					requesterId: partner.id,
					addresseeId: human.id,
					status: ConnectionStatus.Accepted,
					respondedAt: new Date(
						now - thread.endedMinutesAgo * MINUTE,
					),
				}),
			);

			const sent = thread.lines.map((line, position) => ({
				line,
				at: new Date(
					now -
						(thread.endedMinutesAgo +
							(thread.lines.length - 1 - position)) *
							MINUTE,
				),
			}));

			const lastAt = sent.length ? sent[sent.length - 1].at : null;

			await conversations.save(
				conversations.create({
					id: connection.id,
					lastMessageAt: lastAt,
				}),
			);

			await participants.save([
				participants.create({
					conversationId: connection.id,
					userId: human.id,
					isFavourite: thread.favouritedByYou,
					lastReadAt: thread.readByYou ? lastAt : null,
				}),
				participants.create({
					conversationId: connection.id,
					userId: partner.id,
					isFavourite: false,
					lastReadAt: lastAt,
				}),
			]);

			if (sent.length) {
				await messages.save(
					sent.map(({ line, at }) =>
						messages.create({
							conversationId: connection.id,
							senderId: line.fromPartner ? partner.id : human.id,
							kind: MessageKind.Text,
							body: line.body,
							createdAt: at,
						}),
					),
				);
			}

			threads += 1;
		}
	}

	return { humans: humans.length, threads };
}
