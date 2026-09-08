export enum MessageKind {
	Text = 'text',
	Image = 'image',
	/** Written by the server, not by either party. Rendered centred, unattributed. */
	System = 'system',
	/** Carries a meetup proposal, answer or confirmation. Rendered as a card. */
	Meetup = 'meetup',
}
