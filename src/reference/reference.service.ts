import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsOrder, FindOptionsWhere, In, Repository } from 'typeorm';

import { Category } from './entities/category.entity';
import { Hobby } from './entities/hobby.entity';
import { LookupEntity } from './entities/lookup.entity';
import { Occupation } from './entities/occupation.entity';

/**
 * The three seeded pick lists behind the profile screens. They share one service
 * because they are the same knowledge (a sorted, filterable lookup) rather than
 * three lists that happen to look alike.
 */
@Injectable()
export class ReferenceService {
	constructor(
		@InjectRepository(Category)
		private readonly categories: Repository<Category>,
		@InjectRepository(Occupation)
		private readonly occupations: Repository<Occupation>,
		@InjectRepository(Hobby)
		private readonly hobbies: Repository<Hobby>,
	) {}

	listCategories(): Promise<Category[]> {
		return this.listActive(this.categories);
	}

	listOccupations(): Promise<Occupation[]> {
		return this.listActive(this.occupations);
	}

	listHobbies(): Promise<Hobby[]> {
		return this.listActive(this.hobbies);
	}

	async findCategoryOrFail(id: string): Promise<Category> {
		const [found] = await this.resolveAll(
			this.categories,
			[id],
			'UNKNOWN_CATEGORY',
		);

		return found;
	}

	async findOccupationOrFail(id: string): Promise<Occupation> {
		const [found] = await this.resolveAll(
			this.occupations,
			[id],
			'UNKNOWN_OCCUPATION',
		);

		return found;
	}

	resolveHobbies(ids: string[]): Promise<Hobby[]> {
		return this.resolveAll(this.hobbies, ids, 'UNKNOWN_HOBBY');
	}

	private listActive<T extends LookupEntity>(
		repository: Repository<T>,
	): Promise<T[]> {
		return repository.find({
			where: { isActive: true } as FindOptionsWhere<T>,
			order: { sortOrder: 'ASC', label: 'ASC' } as FindOptionsOrder<T>,
		});
	}

	/** Rejects the whole request if any id is unknown, rather than silently dropping it. */
	private async resolveAll<T extends LookupEntity>(
		repository: Repository<T>,
		ids: string[],
		code: string,
	): Promise<T[]> {
		const unique = [...new Set(ids)];

		if (unique.length === 0) return [];

		const found = await repository.find({
			where: { id: In(unique), isActive: true } as FindOptionsWhere<T>,
		});

		if (found.length !== unique.length) {
			const known = new Set(found.map((entry) => entry.id));
			const unknown = unique.filter((id) => !known.has(id));

			throw new BadRequestException({
				code,
				message: `Unknown value: ${unknown.join(', ')}`,
			});
		}

		return found;
	}
}
