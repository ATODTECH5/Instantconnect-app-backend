/**
 * How long after its last authenticated request an account still reads as
 * online. Wide enough that a user reading one screen does not blink offline,
 * short enough that the dot means something. Replace this heuristic with the
 * socket's own connect and disconnect when the realtime gateway lands.
 */
export const ONLINE_WINDOW_MS = 5 * 60 * 1000;

/**
 * The cutoff a `lastActiveAt` must beat to count as online, resolved once per
 * request and passed down. Recomputing it per row would let the rows a filter
 * selected disagree with the flags the response reports.
 */
export function onlineSince(now: Date = new Date()): Date {
	return new Date(now.getTime() - ONLINE_WINDOW_MS);
}

export function isOnline(lastActiveAt: Date | null, since: Date): boolean {
	return lastActiveAt !== null && lastActiveAt >= since;
}
