import * as argon2 from 'argon2';
import { createHash, randomBytes, randomInt } from 'node:crypto';

/**
 * OWASP's recommended argon2id baseline (19 MiB, 2 iterations, 1 lane). The
 * library's own defaults are heavier and cost noticeably more throughput per
 * sign in without buying much against an offline attacker.
 */
const ARGON2_OPTIONS: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

/**
 * Verified against on sign in when no account matches, so that a missing email
 * costs the same wall clock time as a wrong password and cannot be told apart.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$Iq4ZQtBqRJPQjMYCPY0AsQ6nOFYWMKKtSjqDDMCXKmM';

export const hashSecret = (plain: string): Promise<string> =>
  argon2.hash(plain, ARGON2_OPTIONS);

export async function verifySecret(
  hash: string | null,
  plain: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash ?? DUMMY_HASH, plain);
  } catch {
    return false;
  }
}

/** Burns the same work as a real verification without revealing a decision. */
export const burnVerification = (plain: string): Promise<boolean> =>
  verifySecret(DUMMY_HASH, plain);

/**
 * SHA-256 is deliberate for high entropy tokens: there is nothing to brute
 * force in 256 random bits, and a fast digest is what allows lookup by hash.
 */
export const digestToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

export const generateOpaqueToken = (): string =>
  randomBytes(32).toString('base64url');

/** `randomInt` keeps the digits uniform; `Math.random` would not. */
export function generateNumericCode(length: number): string {
  let code = '';

  for (let index = 0; index < length; index += 1) {
    code += randomInt(0, 10).toString();
  }

  return code;
}
