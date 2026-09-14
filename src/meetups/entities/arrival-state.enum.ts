/**
 * One party's journey. Monotonic: a person who has arrived is never "en route"
 * again for the same meetup, so the guard only ever allows moving forward.
 */
export enum ArrivalState {
	Pending = 'pending',
	EnRoute = 'en_route',
	Arrived = 'arrived',
}

const ORDER: readonly ArrivalState[] = [
	ArrivalState.Pending,
	ArrivalState.EnRoute,
	ArrivalState.Arrived,
];

export function isForwardArrival(
	from: ArrivalState,
	to: ArrivalState,
): boolean {
	return ORDER.indexOf(to) > ORDER.indexOf(from);
}
