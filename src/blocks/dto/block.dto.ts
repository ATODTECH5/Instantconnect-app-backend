import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

import type { User } from '../../users/entities/user.entity';
import type { Block } from '../entities/block.entity';

export class CreateBlockDto {
	@ApiProperty({ format: 'uuid', description: 'The account to block.' })
	@IsUUID()
	userId: string;
}

/** One row on the Blocked Users screen. */
export class BlockedUserDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ example: 'Daniel Bloom' })
	fullName: string;

	@ApiPropertyOptional({ nullable: true })
	avatarUrl: string | null;

	@ApiProperty({ example: '2026-08-04T09:12:00.000Z', format: 'date-time' })
	blockedAt: string;

	constructor(block: Block, user: User, avatarUrl: string | null) {
		this.id = user.id;
		this.fullName = user.fullName;
		this.avatarUrl = avatarUrl;
		this.blockedAt = block.createdAt.toISOString();
	}
}

export class BlockedUsersResponseDto {
	@ApiProperty({ type: [BlockedUserDto] })
	items: BlockedUserDto[];

	@ApiProperty({ example: 3 })
	total: number;

	constructor(items: BlockedUserDto[]) {
		this.items = items;
		this.total = items.length;
	}
}
