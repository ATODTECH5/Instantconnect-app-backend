import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gives the online dot on every person card something to read.
 *
 * Presence is derived from one nullable timestamp rather than stored as a
 * boolean, because a boolean has to be cleared by something and nothing is
 * listening for a disconnect yet. A timestamp degrades honestly: a client that
 * stops talking simply ages out of the window.
 *
 * Deliberately not indexed. `lastActiveAt` is rewritten for every active
 * account on a rolling interval, so a btree over it would churn constantly,
 * and discovery already narrows by the GiST index on `location` before
 * presence is ever considered. Revisit if a query lands that filters on
 * presence without also filtering on distance.
 *
 * Null means never seen since this shipped, which reads as offline.
 */
export class Presence1756600000000 implements MigrationInterface {
	name = 'Presence1756600000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "users" ADD COLUMN "lastActiveAt" TIMESTAMP WITH TIME ZONE`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "users" DROP COLUMN "lastActiveAt"`,
		);
	}
}
