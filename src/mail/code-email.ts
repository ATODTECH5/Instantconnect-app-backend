export type CodeEmailKind = 'email-verification' | 'password-reset';

export type CodeEmail = {
	subject: string;
	html: string;
	text: string;
};

const BRAND_PURPLE = '#9333EA';

const COPY: Record<
	CodeEmailKind,
	{ subject: string; heading: string; lead: string; warning: string }
> = {
	'email-verification': {
		subject: 'Your Instant Connect verification code',
		heading: 'Verify your email',
		lead: 'Use this code to finish setting up your account.',
		warning:
			'If you did not create an Instant Connect account, you can ignore this email.',
	},
	'password-reset': {
		subject: 'Your Instant Connect password reset code',
		heading: 'Reset your password',
		lead: 'Use this code to choose a new password.',
		warning:
			'If you did not ask to reset your password, ignore this email and your password stays as it is.',
	},
};

/**
 * The name is validated to letters and a few separators on the way in, so it
 * cannot carry markup today. Escaped anyway, because that rule living in a DTO
 * is not a reason for the template to depend on it.
 */
function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function minutesLabel(minutes: number): string {
	return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

export function codeEmail(
	kind: CodeEmailKind,
	firstName: string,
	code: string,
	ttlMinutes: number,
): CodeEmail {
	const copy = COPY[kind];
	const expiry = minutesLabel(ttlMinutes);
	const name = escapeHtml(firstName);

	const text = [
		`Hi ${firstName},`,
		'',
		copy.lead,
		'',
		`Code: ${code}`,
		`It expires in ${expiry}.`,
		'',
		copy.warning,
		'',
		'Instant Connect',
	].join('\n');

	// Table wrapped and inline styled, since Outlook ignores flexbox and any
	// stylesheet that is not on the element itself.
	const html = `<!doctype html>
<html lang="en">
	<body style="margin:0;padding:0;background-color:#F6F5F8;">
		<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F6F5F8;padding:32px 16px;">
			<tr>
				<td align="center">
					<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#FFFFFF;border-radius:12px;padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
						<tr>
							<td style="font-size:18px;font-weight:700;color:${BRAND_PURPLE};padding-bottom:24px;">Instant Connect</td>
						</tr>
						<tr>
							<td style="font-size:22px;font-weight:700;color:#141119;padding-bottom:12px;">${copy.heading}</td>
						</tr>
						<tr>
							<td style="font-size:15px;line-height:22px;color:#4B4658;padding-bottom:24px;">Hi ${name}, ${copy.lead}</td>
						</tr>
						<tr>
							<td align="center" style="padding-bottom:24px;">
								<div style="display:inline-block;background-color:#FAF5FF;border:1px solid #E9D5FF;border-radius:10px;padding:16px 28px;font-size:32px;font-weight:700;letter-spacing:10px;color:#141119;">${code}</div>
							</td>
						</tr>
						<tr>
							<td style="font-size:14px;line-height:20px;color:#6B6577;padding-bottom:24px;">This code expires in ${expiry}. Do not share it with anyone.</td>
						</tr>
						<tr>
							<td style="font-size:13px;line-height:19px;color:#8B8697;border-top:1px solid #ECEAF0;padding-top:20px;">${copy.warning}</td>
						</tr>
					</table>
				</td>
			</tr>
		</table>
	</body>
</html>`;

	return { subject: copy.subject, html, text };
}
