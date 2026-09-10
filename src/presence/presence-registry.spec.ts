import { PresenceRegistry } from './presence-registry';

const USER = 'a1b2c3d4-0000-4000-8000-000000000001';

describe('PresenceRegistry', () => {
	let registry: PresenceRegistry;

	beforeEach(() => {
		registry = new PresenceRegistry();
	});

	it('reports nobody connected to start with', () => {
		expect(registry.isConnected(USER)).toBe(false);
	});

	it('keeps an account online while any of its sockets remain', () => {
		registry.add(USER);
		registry.add(USER);

		registry.remove(USER);

		expect(registry.isConnected(USER)).toBe(true);
	});

	it('reports offline once the last socket goes', () => {
		registry.add(USER);
		registry.add(USER);

		registry.remove(USER);
		registry.remove(USER);

		expect(registry.isConnected(USER)).toBe(false);
	});

	it('ignores a disconnect for an account it never saw connect', () => {
		registry.remove(USER);

		expect(registry.isConnected(USER)).toBe(false);
	});

	it('prefers a live socket over a stale heuristic', () => {
		const since = new Date('2026-09-08T12:00:00Z');
		const longAgo = new Date('2026-09-08T09:00:00Z');

		expect(registry.isOnline(USER, longAgo, since)).toBe(false);

		registry.add(USER);

		expect(registry.isOnline(USER, longAgo, since)).toBe(true);
	});

	it('still trusts the heuristic for an account with no socket', () => {
		const since = new Date('2026-09-08T12:00:00Z');
		const recent = new Date('2026-09-08T12:01:00Z');

		expect(registry.isOnline(USER, recent, since)).toBe(true);
	});
});
