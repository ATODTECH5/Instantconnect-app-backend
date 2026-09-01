import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { User } from '../users/entities/user.entity';
import { PresenceService } from './presence.service';

const USER = '9f1c0d2e-0000-4000-8000-000000000001';
const OTHER = '9f1c0d2e-0000-4000-8000-000000000002';

const TOUCH_INTERVAL_MS = 60 * 1000;

/** Lets the fire-and-forget update settle before a test asserts on it. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('PresenceService', () => {
	let service: PresenceService;
	let users: Record<string, jest.Mock>;

	beforeEach(async () => {
		jest.useFakeTimers({ doNotFake: ['setImmediate'] });
		jest.setSystemTime(new Date('2026-09-01T12:00:00Z'));

		users = { update: jest.fn().mockResolvedValue({ affected: 1 }) };

		const moduleRef = await Test.createTestingModule({
			providers: [
				PresenceService,
				{ provide: getRepositoryToken(User), useValue: users },
			],
		}).compile();

		service = moduleRef.get(PresenceService);
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it('records the first request it sees for an account', async () => {
		service.touch(USER);
		await flush();

		expect(users.update).toHaveBeenCalledWith(USER, {
			lastActiveAt: new Date('2026-09-01T12:00:00Z'),
		});
	});

	it('does not write again within the touch interval', async () => {
		service.touch(USER);
		jest.advanceTimersByTime(TOUCH_INTERVAL_MS - 1);
		service.touch(USER);
		await flush();

		expect(users.update).toHaveBeenCalledTimes(1);
	});

	it('writes again once the touch interval has passed', async () => {
		service.touch(USER);
		jest.advanceTimersByTime(TOUCH_INTERVAL_MS);
		service.touch(USER);
		await flush();

		expect(users.update).toHaveBeenCalledTimes(2);
		expect(users.update).toHaveBeenLastCalledWith(USER, {
			lastActiveAt: new Date('2026-09-01T12:01:00Z'),
		});
	});

	it('throttles each account separately', async () => {
		service.touch(USER);
		service.touch(OTHER);
		await flush();

		expect(users.update).toHaveBeenCalledTimes(2);
	});

	/**
	 * The throttle must not swallow the retry: an account whose write failed is
	 * dropped from the map so the very next request tries again.
	 */
	it('retries on the next request when the write fails', async () => {
		users.update.mockRejectedValueOnce(new Error('connection reset'));

		service.touch(USER);
		await flush();
		service.touch(USER);
		await flush();

		expect(users.update).toHaveBeenCalledTimes(2);
	});

	it('never rejects when the write fails', async () => {
		users.update.mockRejectedValueOnce(new Error('connection reset'));

		expect(() => service.touch(USER)).not.toThrow();
		await expect(flush()).resolves.toBeUndefined();
	});
});
