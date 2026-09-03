import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { DEFAULT_PAGE_SIZE } from '../../common/dto/pagination.dto';
import { ConnectionStatus } from '../entities/connection-status.enum';
import { ListConnectionsQueryDto } from './list-connections-query.dto';

/** Mirrors the global pipe in main.ts, which is what made the original bug. */
const parse = (query: Record<string, unknown>) => {
	const dto = plainToInstance(ListConnectionsQueryDto, query, {
		enableImplicitConversion: false,
	});

	return {
		dto,
		errors: validateSync(dto, {
			whitelist: true,
			forbidNonWhitelisted: true,
		}),
	};
};

describe('ListConnectionsQueryDto', () => {
	/**
	 * Regression: `status` used to be a bare @Query('status') beside
	 * @Query() PaginationQueryDto, so `forbidNonWhitelisted` validated the query
	 * against pagination alone and rejected every filtered request with
	 * "property status should not exist".
	 */
	it('accepts a status alongside the pagination fields', () => {
		const { dto, errors } = parse({ status: 'accepted' });

		expect(errors).toHaveLength(0);
		expect(dto.status).toBe(ConnectionStatus.Accepted);
	});

	it('defaults the page when only a status is given', () => {
		const { dto } = parse({ status: 'pending' });

		expect(dto.limit).toBe(DEFAULT_PAGE_SIZE);
		expect(dto.offset).toBe(0);
	});

	it('leaves status undefined when it is omitted', () => {
		const { dto, errors } = parse({});

		expect(errors).toHaveLength(0);
		expect(dto.status).toBeUndefined();
	});

	it('rejects a status outside the enum', () => {
		const { errors } = parse({ status: 'bogus' });

		expect(errors).toHaveLength(1);
		expect(errors[0].property).toBe('status');
	});

	it('still rejects an unknown property', () => {
		const { errors } = parse({ nope: 1 });

		expect(errors.some((error) => error.property === 'nope')).toBe(true);
	});
});
