import type { PlainEmail } from '../mail/mailer';
import { DispatchTrigger } from './entities/safety-dispatch.entity';

export type CheckInContext = {
	userName: string;
	contactName: string;
	partyName: string;
	venueName: string | null;
	venueAddress: string | null;
	scheduledAt: Date | null;
};

const BRAND_PURPLE = '#9333EA';

type Writer = {
	subject: (name: string) => string;
	lead: (name: string, party: string) => string;
};

const COPY: Record<DispatchTrigger, Writer> = {
	[DispatchTrigger.Verified]: {
		subject: (name) => `${name} arrived safely`,
		lead: (name, party) =>
			`${name} safely established connection with ${party}. Both confirmed they arrived using their one time codes.`,
	},
	[DispatchTrigger.Ended]: {
		subject: (name) => `${name}'s meetup has ended safely`,
		lead: (name, party) =>
			`${name} safely established connection with ${party}. Tracking ended safely.`,
	},
	[DispatchTrigger.Manual]: {
		subject: (name) => `${name} checked in: all good`,
		lead: (name, party) =>
			`${name} checked in from their meetup with ${party} to say everything is fine.`,
	},
};

/**
 * Plain, short, and honest about what the app actually knows. The contact is
 * not a user, so nothing here assumes they have the app or an account.
 */
/** The sentence the dispatch screen previews: the email's lead plus where and when. */
export function checkInPreview(
	trigger: DispatchTrigger,
	ctx: CheckInContext,
): string {
	const lead = COPY[trigger].lead(ctx.userName, ctx.partyName);
	const at = ctx.venueName ? ` at ${ctx.venueName}` : '';
	const when = ctx.scheduledAt ? ` (${formatTime(ctx.scheduledAt)})` : '';

	return lead.replace(/\.( |$)/, `${at}${when}.$1`);
}

function formatTime(date: Date): string {
	return date.toLocaleTimeString('en-GB', {
		hour: '2-digit',
		minute: '2-digit',
	});
}

export function checkInEmail(
	trigger: DispatchTrigger,
	ctx: CheckInContext,
): PlainEmail {
	const writer = COPY[trigger];
	const subject = writer.subject(ctx.userName);
	const lead = writer.lead(ctx.userName, ctx.partyName);
	const where = ctx.venueName
		? `${ctx.venueName}${ctx.venueAddress ? `, ${ctx.venueAddress}` : ''}`
		: null;
	const when = ctx.scheduledAt
		? ctx.scheduledAt.toLocaleString('en-GB', {
				weekday: 'short',
				day: 'numeric',
				month: 'short',
				hour: '2-digit',
				minute: '2-digit',
			})
		: null;
	const details = [
		where ? `Where: ${where}` : null,
		when ? `When: ${when}` : null,
	]
		.filter((line): line is string => line !== null)
		.join('\n');

	const text = [
		`Hi ${ctx.contactName},`,
		'',
		lead,
		details ? `\n${details}` : '',
		'',
		`You are getting this because ${ctx.userName} added you to a safety circle on Instant Connect. Nothing is needed from you.`,
	].join('\n');

	const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1F1D2B">
  <p style="color:${BRAND_PURPLE};font-weight:600;margin:0 0 16px">Instant Connect safety check-in</p>
  <p>Hi ${escape(ctx.contactName)},</p>
  <p>${escape(lead)}</p>
  ${details ? `<p style="color:#5B5873;white-space:pre-line">${escape(details)}</p>` : ''}
  <p style="color:#83818E;font-size:13px;margin-top:24px">You are getting this because ${escape(ctx.userName)} added you to a safety circle on Instant Connect. Nothing is needed from you.</p>
</div>`;

	return { subject, html, text };
}

function escape(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}
