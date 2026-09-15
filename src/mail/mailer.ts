/**
 * Abstract rather than an interface so it can double as the injection token.
 * Swapping in a real provider means binding a different implementation in
 * {@link MailModule}; nothing outside this directory changes.
 */
export abstract class Mailer {
	abstract sendEmailVerificationCode(
		to: string,
		firstName: string,
		code: string,
	): Promise<void>;

	abstract sendPasswordResetCode(
		to: string,
		firstName: string,
		code: string,
	): Promise<void>;

	/**
	 * A settings code: email change, phone change or account deletion. One
	 * method rather than three, since the templates differ only in copy.
	 */
	abstract sendAccountCode(
		kind: AccountCodeKind,
		to: string,
		firstName: string,
		code: string,
	): Promise<void>;

	/** A safety check-in to an outside contact. Copy is composed by the caller. */
	abstract sendSafetyCheckIn(to: string, email: PlainEmail): Promise<void>;
}

export type PlainEmail = { subject: string; html: string; text: string };

export type AccountCodeKind =
	'email-change' | 'phone-change' | 'account-deletion';
