/**
 * The meetup as a whole. Per-party travel state lives on the participant row.
 * Only the server moves a meetup between these; the client asks for a
 * transition by name and is told whether it happened.
 */
export enum MeetupStatus {
	/** Times on the table, waiting on `awaitingUserId`. */
	Proposed = 'proposed',
	/** A time was accepted. Both parties may now travel. */
	Scheduled = 'scheduled',
	/** Both parties verified each other's arrival code. */
	Active = 'active',
	/** Either party ended an active meetup. */
	Ended = 'ended',
	/** The invitee said no to the proposal. */
	Declined = 'declined',
	/** Withdrawn before it happened, by either party. */
	Cancelled = 'cancelled',
	/** Every proposed time passed without an answer. Settled lazily on read. */
	Expired = 'expired',
}

/** Rows that block another proposal in the same thread. */
export const OPEN_MEETUP_STATUSES: readonly MeetupStatus[] = [
	MeetupStatus.Proposed,
	MeetupStatus.Scheduled,
	MeetupStatus.Active,
];
