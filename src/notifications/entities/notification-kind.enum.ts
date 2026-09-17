export enum NotificationKind {
	/** Someone you are connected to sent a message. */
	Message = 'message',
	/** Someone asked to connect. */
	ConnectionRequest = 'connection_request',
	/** Someone accepted your request. */
	ConnectionAccepted = 'connection_accepted',
	/** Someone proposed times to meet, or countered yours. */
	MeetupProposed = 'meetup_proposed',
	/** Your proposal was accepted; the meetup is scheduled. */
	MeetupAccepted = 'meetup_accepted',
	MeetupDeclined = 'meetup_declined',
	/** A scheduled meetup was withdrawn by the other party. */
	MeetupCancelled = 'meetup_cancelled',
	/** Someone who registered with your referral code has verified their email. */
	ReferralJoined = 'referral_joined',
}
