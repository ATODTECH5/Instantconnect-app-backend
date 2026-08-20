import { ServiceUnavailableException } from '@nestjs/common';

import { authConfig, mailConfig } from '../config/configuration';
import { codeEmail } from './code-email';
import { ResendMailer } from './resend-mailer.service';

const mockSend = jest.fn();

jest.mock('resend', () => ({
	Resend: jest.fn(() => ({ emails: { send: mockSend } })),
}));

const mail = {
	from: 'Instant Connect <onboarding@resend.dev>',
	resendApiKey: 're_test_key',
} as unknown as ReturnType<typeof mailConfig>;

const auth = { codeTtlMinutes: 10 } as unknown as ReturnType<typeof authConfig>;

type SendCalls = [
	{ from: string; to: string; subject: string; html: string; text: string },
][];

describe('codeEmail', () => {
	it('carries the code, the expiry and the recipient name', () => {
		const { subject, html, text } = codeEmail(
			'email-verification',
			'Ada',
			'4321',
			10,
		);

		expect(subject).toContain('verification');
		expect(html).toContain('4321');
		expect(html).toContain('Ada');
		expect(html).toContain('10 minutes');
		expect(text).toContain('4321');
	});

	it('says minute rather than minutes for a one minute expiry', () => {
		expect(
			codeEmail('email-verification', 'Ada', '4321', 1).html,
		).toContain('1 minute.');
	});

	it('writes different copy for a reset than for a verification', () => {
		const verify = codeEmail('email-verification', 'Ada', '4321', 10);
		const reset = codeEmail('password-reset', 'Ada', '4321', 10);

		expect(reset.subject).not.toEqual(verify.subject);
		expect(reset.html).toContain('Reset your password');
	});

	it('escapes markup in the name rather than emitting it', () => {
		const { html } = codeEmail(
			'email-verification',
			'<script>alert(1)</script>',
			'4321',
			10,
		);

		expect(html).not.toContain('<script>');
		expect(html).toContain('&lt;script&gt;');
	});
});

describe('ResendMailer', () => {
	let mailer: ResendMailer;

	beforeEach(() => {
		mockSend.mockReset();
		mailer = new ResendMailer(mail, auth);
	});

	it('sends from the configured address and resolves when accepted', async () => {
		mockSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });

		await expect(
			mailer.sendEmailVerificationCode('ada@example.com', 'Ada', '4321'),
		).resolves.toBeUndefined();

		const [[payload]] = mockSend.mock.calls as SendCalls;

		expect(payload.from).toBe(mail.from);
		expect(payload.to).toBe('ada@example.com');
		expect(payload.html).toContain('4321');
	});

	/** A rejected send arrives in the payload, so an unchecked call would pass. */
	it('throws when Resend rejects the send', async () => {
		mockSend.mockResolvedValue({
			data: null,
			error: { name: 'validation_error', message: 'Domain not verified' },
		});

		await expect(
			mailer.sendEmailVerificationCode('ada@example.com', 'Ada', '4321'),
		).rejects.toBeInstanceOf(ServiceUnavailableException);
	});

	it('keeps the provider message out of what the caller is told', async () => {
		mockSend.mockResolvedValue({
			data: null,
			error: { name: 'validation_error', message: 'Domain not verified' },
		});

		await expect(
			mailer.sendPasswordResetCode('ada@example.com', 'Ada', '4321'),
		).rejects.toThrow(/try again in a moment/i);
	});
});
