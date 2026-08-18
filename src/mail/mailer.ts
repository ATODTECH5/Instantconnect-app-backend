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
}
