import {
  burnVerification,
  digestToken,
  generateNumericCode,
  generateOpaqueToken,
  hashSecret,
  verifySecret,
} from './hashing.util';

describe('hashing.util', () => {
  describe('hashSecret / verifySecret', () => {
    it('accepts the secret it hashed', async () => {
      const hash = await hashSecret('Correct-Horse1');

      await expect(verifySecret(hash, 'Correct-Horse1')).resolves.toBe(true);
    });

    it('rejects a different secret', async () => {
      const hash = await hashSecret('Correct-Horse1');

      await expect(verifySecret(hash, 'Correct-Horse2')).resolves.toBe(false);
    });

    it('produces a different hash each time, so equal passwords are not linkable', async () => {
      const [first, second] = await Promise.all([
        hashSecret('Correct-Horse1'),
        hashSecret('Correct-Horse1'),
      ]);

      expect(first).not.toEqual(second);
    });

    it('returns false rather than throwing when there is no stored hash', async () => {
      await expect(verifySecret(null, 'anything')).resolves.toBe(false);
    });

    it('returns false rather than throwing on a corrupt hash', async () => {
      await expect(verifySecret('not-a-hash', 'anything')).resolves.toBe(false);
    });
  });

  describe('burnVerification', () => {
    it('always fails, so it cannot accidentally authenticate anyone', async () => {
      await expect(burnVerification('anything')).resolves.toBe(false);
    });
  });

  describe('digestToken', () => {
    it('is deterministic', () => {
      expect(digestToken('token')).toEqual(digestToken('token'));
    });

    it('returns a 64 character hex digest that fits the tokenHash column', () => {
      expect(digestToken('token')).toMatch(/^[0-9a-f]{64}$/);
    });

    it('separates different tokens', () => {
      expect(digestToken('a')).not.toEqual(digestToken('b'));
    });
  });

  describe('generateNumericCode', () => {
    it('returns only digits, at the requested length', () => {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        expect(generateNumericCode(6)).toMatch(/^\d{6}$/);
      }
    });

    it('does not return a constant', () => {
      const codes = new Set(
        Array.from({ length: 50 }, () => generateNumericCode(6)),
      );

      expect(codes.size).toBeGreaterThan(1);
    });
  });

  describe('generateOpaqueToken', () => {
    it('is url safe', () => {
      expect(generateOpaqueToken()).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('does not repeat', () => {
      const tokens = new Set(
        Array.from({ length: 100 }, () => generateOpaqueToken()),
      );

      expect(tokens.size).toBe(100);
    });
  });
});
