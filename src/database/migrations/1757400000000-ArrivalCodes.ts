import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Arrival codes, Phase 3 step 11. Three columns on the participant row,
 * because each party has their own code: A shows theirs to B, B enters it,
 * and that verifies A. The meetup goes active only once both are verified.
 *
 * Hashed like the PIN, never stored plain. A four digit space is small, so
 * the hash is not what protects it; the attempt counter and the expiry are,
 * with the route's throttle behind them. `attempts` counts the other party's
 * wrong guesses at this person's code and is reset by regenerating.
 */
export class ArrivalCodes1757400000000 implements MigrationInterface {
	name = 'ArrivalCodes1757400000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
      ALTER TABLE "meetup_participants"
        ADD COLUMN "arrivalCodeHash" character varying(255),
        ADD COLUMN "arrivalCodeExpiresAt" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN "arrivalCodeAttempts" integer NOT NULL DEFAULT 0
    `);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
      ALTER TABLE "meetup_participants"
        DROP COLUMN "arrivalCodeAttempts",
        DROP COLUMN "arrivalCodeExpiresAt",
        DROP COLUMN "arrivalCodeHash"
    `);
	}
}
