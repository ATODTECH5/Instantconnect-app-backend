/** One event from a third party listing, already mapped onto our fields. */
export type ImportedEvent = {
	externalId: string;
	url: string;
	title: string;
	description: string | null;
	startsAt: Date;
	endsAt: Date | null;
	venueName: string;
	venueAddress: string | null;
	latitude: number;
	longitude: number;
	/** Kobo. Zero is a free event. */
	priceMinor: number;
	coverUrl: string | null;
	organizerName: string | null;
};
