import { Injectable } from '@nestjs/common';

import { isOnline as withinWindow } from './online-window';

/**
 * Who is holding a live socket right now.
 *
 * The `lastActiveAt` heuristic can only say "was active in the last five
 * minutes", which reads as online for up to five minutes after someone leaves.
 * A socket knows the moment it drops, so a connected account is reported online
 * exactly while it is connected, and the heuristic stays as the answer for
 * anyone using the app without a socket.
 *
 * Counted rather than a plain set: one account can hold several sockets at once
 * (two devices, or a reconnect racing its own teardown), and the first
 * disconnect must not report them offline while another socket is still open.
 *
 * In memory, so it describes this instance alone. A second instance needs the
 * socket.io Redis adapter and a shared store before this stays true.
 */
@Injectable()
export class PresenceRegistry {
	private readonly sockets = new Map<string, number>();

	add(userId: string): void {
		this.sockets.set(userId, (this.sockets.get(userId) ?? 0) + 1);
	}

	remove(userId: string): void {
		const open = (this.sockets.get(userId) ?? 0) - 1;

		if (open > 0) this.sockets.set(userId, open);
		else this.sockets.delete(userId);
	}

	isConnected(userId: string): boolean {
		return this.sockets.has(userId);
	}

	/** A live socket wins; otherwise fall back to when the account last spoke. */
	isOnline(userId: string, lastActiveAt: Date | null, since: Date): boolean {
		return this.isConnected(userId) || withinWindow(lastActiveAt, since);
	}
}
