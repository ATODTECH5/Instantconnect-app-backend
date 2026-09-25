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
	/** An admin approved your identity documents; the badge is on. */
	KycApproved = 'kyc_approved',
	/** An admin rejected them; the reason is on the KYC screen. */
	KycRejected = 'kyc_rejected',
	/** A connection invited you to an event they are hosting. */
	EventInvite = 'event_invite',
}
