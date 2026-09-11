import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Makes the Create PIN screen real. Until now `createPin()` on the client
 * discarded the value and `pinEnabled` was a flag the client asserted about
 * itself, so an account could claim a PIN that existed nowhere.
 *
 * Hashed with argon2id, same as `passwordHash`, and `select: false` for the
 * same reason. A four digit PIN has 10,000 possibilities, so the hash is not
 * what protects it — the attempt limit on the verify endpoint is. The hash
 * only stops a database read from handing over every PIN in plaintext.
 *
 * `pinEnabled` stays, but stops being client-supplied: it is now written by
 * the server whenever the hash is written or cleared, so the flag and the hash
 * cannot disagree. Existing rows claiming `pinEnabled` with no hash behind
 * them are corrected to false on the way up.
 */
export class UserPin1757100000000 implements MigrationInterface {
	name = 'UserPin1757100000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "users" ADD COLUMN "pinHash" character varying(255)`,
		);
		await queryRunner.query(
			`UPDATE "users" SET "pinEnabled" = false WHERE "pinEnabled" = true`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "pinHash"`);
	}
}
