export const normaliseEmail = (email: string): string =>
  email.trim().toLowerCase();

/**
 * Accepts either format the client's sign up form allows (local 0XXXXXXXXXX or
 * international +234XXXXXXXXXX) and stores one canonical form, so the same
 * person cannot register twice by switching notation.
 */
export function toE164Nigerian(phone: string): string {
  const digits = phone.replace(/[\s()-]/g, '').replace(/^\+/, '');

  return digits.startsWith('234')
    ? `+${digits}`
    : `+234${digits.replace(/^0/, '')}`;
}
