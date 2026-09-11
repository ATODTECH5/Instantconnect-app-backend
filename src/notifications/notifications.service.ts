import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { PageInfoDto } from '../common/dto/pagination.dto';
import type { PaginationQueryDto } from '../common/dto/pagination.dto';
import { Storage } from '../storage/storage';
import { AVATAR_POSITION } from '../users/entities/user-photo.entity';
import {
	NotificationPageDto,
	NotificationResponseDto,
} from './dto/notification-response.dto';
import { NotificationKind } from './entities/notification-kind.enum';
import { Notification } from './entities/notification.entity';

export type CreateNotification = {
	userId: string;
	kind: NotificationKind;
	actorId?: string | null;
	subjectId?: string | null;
};

@Injectable()
export class NotificationsService {
	constructor(
		@InjectRepository(Notification)
		private readonly notifications: Repository<Notification>,
		private readonly storage: Storage,
	) {}

	/**
	 * Writes the row and hands back the rendered notification, so the caller
	 * can put the same object on the socket it just stored. Emitting is the
	 * caller's job rather than this service's: the socket gateway belongs to
	 * chat, and importing it here would make the two modules circular.
	 */
	async create(input: CreateNotification): Promise<NotificationResponseDto> {
		const saved = await this.notifications.save(
			this.notifications.create({
				userId: input.userId,
				kind: input.kind,
				actorId: input.actorId ?? null,
				subjectId: input.subjectId ?? null,
			}),
		);

		return this.toDto(await this.withActor(saved.id));
	}

	async list(
		userId: string,
		query: PaginationQueryDto,
	): Promise<NotificationPageDto> {
		const [rows, total] = await this.notifications.findAndCount({
			where: { userId },
			relations: { actor: { photos: true } },
			order: { createdAt: 'DESC' },
			take: query.limit,
			skip: query.offset,
		});

		return new NotificationPageDto(
			rows.map((row) => this.toDto(row)),
			new PageInfoDto(total, query),
			await this.countUnread(userId),
		);
	}

	countUnread(userId: string): Promise<number> {
		return this.notifications.count({
			where: { userId, readAt: IsNull() },
		});
	}

	/** Idempotent: marking an already read notification changes nothing. */
	async markRead(
		userId: string,
		id: string,
	): Promise<NotificationResponseDto> {
		const row = await this.notifications.findOne({
			where: { id, userId },
			relations: { actor: { photos: true } },
		});

		if (!row) {
			throw new NotFoundException({
				code: 'NOT_FOUND',
				message: 'That notification does not exist.',
			});
		}

		if (row.readAt === null) {
			row.readAt = new Date();
			await this.notifications.update({ id }, { readAt: row.readAt });
		}

		return this.toDto(row);
	}

	/** Returns how many were still unread, which is what the bell was showing. */
	async markAllRead(userId: string): Promise<{ cleared: number }> {
		const result = await this.notifications.update(
			{ userId, readAt: IsNull() },
			{ readAt: new Date() },
		);

		return { cleared: result.affected ?? 0 };
	}

	private async withActor(id: string): Promise<Notification> {
		const row = await this.notifications.findOne({
			where: { id },
			relations: { actor: { photos: true } },
		});

		// It was saved a moment ago in the same request, so this cannot miss.
		if (!row) throw new NotFoundException();

		return row;
	}

	private toDto(row: Notification): NotificationResponseDto {
		const avatar = row.actor?.photos?.find(
			(photo) => photo.position === AVATAR_POSITION,
		);

		return new NotificationResponseDto(
			row,
			avatar
				? this.storage.buildUrl(avatar.storageId, 'thumbnail')
				: null,
		);
	}
}
