import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Live location during a meetup, Phase 3 step 12. Three columns on the
 * participant row, since each party shares independently and only their own
 * last fix is kept: one point, overwritten on every report, never a trail.
 * A history table would be a movement log of people meeting strangers, and
 * nothing in the product needs it.
 *
 * `isSharingLocation` is the consent switch. The server refuses to store a
 * fix while it is off and clears the last one when it is turned off, so a
 * stale position cannot outlive the decision to stop sharing.
 *
 * Geography rather than lat/lng columns so the safe-zone distance to the
 * meetup's `venueLocation` is one `ST_Distance` in metres when it is ever
 * needed in SQL; today it is computed in the service from the two points.
 */
export class LiveLocation1757500000000 implements MigrationInterface {
	name = 'LiveLocation1757500000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
      ALTER TABLE "meetup_participants"
        ADD COLUMN "isSharingLocation" boolean NOT NULL DEFAULT false,
        ADD COLUMN "lastLocation" geography(Point, 4326),
        ADD COLUMN "lastLocationAt" TIMESTAMP WITH TIME ZONE
    `);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
      ALTER TABLE "meetup_participants"
        DROP COLUMN "lastLocationAt",
        DROP COLUMN "lastLocation",
        DROP COLUMN "isSharingLocation"
    `);
	}
}
