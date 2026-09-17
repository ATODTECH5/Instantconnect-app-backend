import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PageInfoDto } from '../common/dto/pagination.dto';
import type { PaginationQueryDto } from '../common/dto/pagination.dto';
import { User } from '../users/entities/user.entity';
import { UserStatus } from '../users/entities/user-status.enum';
import {
	SupportMessageDto,
	SupportMessagePageDto,
} from './dto/support-message.dto';
import {
	SupportMessage,
	SupportMessageDirection,
} from './entities/support-message.entity';

@Injectable()
export class SupportService {
	constructor(
		@InjectRepository(SupportMessage)
		private readonly messages: Repository<SupportMessage>,
		@InjectRepository(User)
		private readonly users: Repository<User>,
	) {}

	/** Newest first, both directions; the client splits them by direction. */
	async list(
		userId: string,
		query: PaginationQueryDto,
	): Promise<SupportMessagePageDto> {
		const [rows, total] = await this.messages.findAndCount({
			where: { userId },
			order: { createdAt: 'DESC' },
			take: query.limit,
			skip: query.offset,
		});

		return new SupportMessagePageDto(
			rows.map((row) => new SupportMessageDto(row)),
			new PageInfoDto(total, query),
		);
	}

	async send(userId: string, body: string): Promise<SupportMessageDto> {
		const saved = await this.messages.save(
			this.messages.create({
				userId,
				direction: SupportMessageDirection.Inbound,
				body,
			}),
		);

		return new SupportMessageDto(saved);
	}

	async reply(
		userId: string,
		agentName: string,
		subject: string,
		body: string,
	): Promise<SupportMessageDto> {
		const exists = await this.users.exists({
			where: { id: userId, status: UserStatus.Active },
		});

		if (!exists) {
			throw new NotFoundException({
				code: 'USER_NOT_FOUND',
				message: 'That account does not exist.',
			});
		}

		const saved = await this.messages.save(
			this.messages.create({
				userId,
				direction: SupportMessageDirection.Outbound,
				agentName,
				subject,
				body,
			}),
		);

		return new SupportMessageDto(saved);
	}
}
