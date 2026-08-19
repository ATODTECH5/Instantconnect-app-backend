import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { Interest } from './entities/interest.entity';

@Injectable()
export class InterestsService {
	constructor(
		@InjectRepository(Interest)
		private readonly interests: Repository<Interest>,
	) {}

	findActive(): Promise<Interest[]> {
		return this.interests.find({
			where: { isActive: true },
			order: { sortOrder: 'ASC' },
		});
	}

	/** Rejects the whole request if any id is unknown, rather than silently dropping it. */
	async resolveActive(ids: string[]): Promise<Interest[]> {
		const unique = [...new Set(ids)];
		const found = await this.interests.find({
			where: { id: In(unique), isActive: true },
		});

		if (found.length !== unique.length) {
			const known = new Set(found.map((interest) => interest.id));
			const unknown = unique.filter((id) => !known.has(id));

			throw new BadRequestException({
				code: 'UNKNOWN_INTEREST',
				message: `Unknown interest: ${unknown.join(', ')}`,
			});
		}

		return found;
	}
}
