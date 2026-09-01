import { ONLINE_WINDOW_MS, isOnline, onlineSince } from './online-window';

const NOW = new Date('2026-09-01T12:00:00Z');

describe('onlineSince', () => {
	it('is the start of the online window', () => {
		expect(onlineSince(NOW)).toEqual(
			new Date(NOW.getTime() - ONLINE_WINDOW_MS),
		);
	});
});

describe('isOnline', () => {
	const since = onlineSince(NOW);

	it('treats an account with no recorded activity as offline', () => {
		expect(isOnline(null, since)).toBe(false);
	});

	it('counts activity inside the window', () => {
		expect(isOnline(new Date(NOW.getTime() - 1000), since)).toBe(true);
	});

	it('counts the boundary itself as online', () => {
		expect(isOnline(since, since)).toBe(true);
	});

	it('does not count activity older than the window', () => {
		expect(isOnline(new Date(since.getTime() - 1), since)).toBe(false);
	});
});
