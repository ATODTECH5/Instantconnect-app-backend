import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import { Connection } from '../connections/entities/connection.entity';
import { Storage } from '../storage/storage';
import {
	AVATAR_POSITION,
	UserPhoto,
} from '../users/entities/user-photo.entity';
import { User } from '../users/entities/user.entity';
import { UserStatus } from '../users/entities/user-status.enum';
import { BlockedUserDto, BlockedUsersResponseDto } from './dto/block.dto';
import { Block } from './entities/block.entity';

@Injectable()
export class BlocksService {
	constructor(
		@InjectRepository(Block)
		private readonly blocks: Repository<Block>,
		@InjectRepository(User)
		private readonly users: Repository<User>,
		@InjectRepository(UserPhoto)
		private readonly photos: Repository<UserPhoto>,
		private readonly storage: Storage,
		private readonly dataSource: DataSource,
	) {}

	async list(viewerId: string): Promise<BlockedUsersResponseDto> {
		const blocks = await this.blocks.find({
			where: { blockerId: viewerId },
			relations: { blocked: true },
			order: { createdAt: 'DESC' },
		});

		const avatars = await this.avatarUrlsFor(
			blocks.map((block) => block.blockedId),
		);

		return new BlockedUsersResponseDto(
			blocks.map(
				(block) =>
					new BlockedUserDto(
						block,
						block.blocked,
						avatars.get(block.blockedId) ?? null,
					),
			),
		);
	}

	/**
	 * Blocking also drops whatever connection the pair had, in either
	 * direction and whatever its state, so the blocked person cannot keep a
	 * "Connected" badge on someone who no longer wants them there. Idempotent:
	 * blocking twice is one block.
	 */
	async block(viewerId: string, targetId: string): Promise<void> {
		if (viewerId === targetId) {
			throw new BadRequestException({
				code: 'CANNOT_BLOCK_SELF',
				message: 'You cannot block yourself.',
			});
		}

		const target = await this.users.findOne({
			where: { id: targetId, status: UserStatus.Active },
			select: { id: true },
		});

		if (!target) {
			throw new NotFoundException({
				code: 'USER_NOT_FOUND',
				message: 'That person is no longer available.',
			});
		}

		await this.dataSource.transaction(async (manager) => {
			await manager
				.createQueryBuilder()
				.insert()
				.into(Block)
				.values({ blockerId: viewerId, blockedId: targetId })
				.orIgnore()
				.execute();

			await manager.delete(Connection, [
				{ requesterId: viewerId, addresseeId: targetId },
				{ requesterId: targetId, addresseeId: viewerId },
			]);
		});
	}

	/** Only the blocker can lift it; the row simply goes. The connection does not come back. */
	async unblock(viewerId: string, targetId: string): Promise<void> {
		const result = await this.blocks.delete({
			blockerId: viewerId,
			blockedId: targetId,
		});

		if (!result.affected) {
			throw new NotFoundException({
				code: 'BLOCK_NOT_FOUND',
				message: 'That person is not blocked.',
			});
		}
	}

	/** True when either party has blocked the other. */
	async isBlockedEitherWay(a: string, b: string): Promise<boolean> {
		return this.blocks.exists({
			where: [
				{ blockerId: a, blockedId: b },
				{ blockerId: b, blockedId: a },
			],
		});
	}

	/**
	 * For discovery: a SQL fragment that hides anyone the viewer has blocked
	 * and anyone who has blocked the viewer. Written as a fragment so the
	 * discovery query keeps its single pass rather than post-filtering a page.
	 */
	static hiddenFromViewerClause(
		userAlias: string,
		viewerParam: string,
	): string {
		return `NOT EXISTS (
			SELECT 1 FROM "blocks" b
			WHERE (b."blockerId" = :${viewerParam} AND b."blockedId" = ${userAlias}.id)
			   OR (b."blockerId" = ${userAlias}.id AND b."blockedId" = :${viewerParam})
		)`;
	}

	private async avatarUrlsFor(
		userIds: string[],
	): Promise<Map<string, string>> {
		if (userIds.length === 0) return new Map();

		const rows = await this.photos.find({
			where: { userId: In(userIds), position: AVATAR_POSITION },
			select: { userId: true, storageId: true },
		});

		return new Map(
			rows.map((row) => [
				row.userId,
				this.storage.buildUrl(row.storageId, 'thumbnail'),
			]),
		);
	}
}
