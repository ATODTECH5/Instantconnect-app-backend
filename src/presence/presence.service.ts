import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../users/entities/user.entity';

/**
 * Shortest gap between two writes for the same account. Presence is only read
 * at minute granularity, so writing on every request would spend a row update
 * per API call to say something the previous one already said.
 */
const TOUCH_INTERVAL_MS = 60 * 1000;

/**
 * Above this many tracked accounts the throttle map is swept. It only ever
 * holds accounts seen within the last interval, so the cap is a guard against
 * an unexpected burst rather than a limit reached in normal traffic.
 */
const SWEEP_THRESHOLD = 10_000;

@Injectable()
export class PresenceService {
	private readonly logger = new Logger(PresenceService.name);

	/**
	 * Per-instance, so a fleet of N instances writes at most N times per
	 * interval for one very active account. That is a cheaper trade than the
	 * shared store a globally exact throttle would need, and the extra writes
	 * are idempotent.
	 */
	private readonly writtenAt = new Map<string, number>();

	constructor(
		@InjectRepository(User)
		private readonly users: Repository<User>,
	) {}

	/**
	 * Records that an account is awake. Never awaited and never throws: a
	 * failure here must not turn a working request into an error response, so
	 * the write is dropped and the next request retries it.
	 */
	touch(userId: string): void {
		const now = Date.now();
		const previous = this.writtenAt.get(userId);

		if (previous !== undefined && now - previous < TOUCH_INTERVAL_MS) {
			return;
		}

		this.writtenAt.set(userId, now);

		if (this.writtenAt.size > SWEEP_THRESHOLD) {
			this.sweep(now);
		}

		void this.users
			.update(userId, { lastActiveAt: new Date(now) })
			.catch((error: unknown) => {
				this.writtenAt.delete(userId);
				this.logger.warn(
					`Could not record presence for ${userId}: ${String(error)}`,
				);
			});
	}

	private sweep(now: number): void {
		for (const [userId, at] of this.writtenAt) {
			if (now - at >= TOUCH_INTERVAL_MS) {
				this.writtenAt.delete(userId);
			}
		}
	}
}
