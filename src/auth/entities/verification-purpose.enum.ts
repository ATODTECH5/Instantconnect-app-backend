export enum VerificationPurpose {
	EmailVerification = 'email_verification',
	PasswordReset = 'password_reset',
	/** Settings: the code goes to the address being adopted, not the current one. */
	EmailChange = 'email_change',
	/** Settings: no SMS provider yet, so the code goes to the account email. */
	PhoneChange = 'phone_change',
	AccountDeletion = 'account_deletion',
}
