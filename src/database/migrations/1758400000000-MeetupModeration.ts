import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets an admin watching Live Connections flag a meetup with a reason, and
 * send both people a safety check. The flag lives on the meetup because it is
 * about the meeting, not either person; unflagging clears all three columns.
 * Safety checks are ordinary notifications, so the count and times an admin
 * sees are read from `notifications` rather than stored twice.
 */
export class MeetupModeration1758400000000 implements MigrationInterface {
	name = 'MeetupModeration1758400000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TYPE "notifications_kind_enum" ADD VALUE IF NOT EXISTS 'meetup_safety_check'`,
		);

		await queryRunner.query(`
      ALTER TABLE "meetups"
        ADD "flaggedAt" TIMESTAMP WITH TIME ZONE,
        ADD "flaggedById" uuid,
        ADD "flagReason" character varying(300),
        ADD CONSTRAINT "FK_meetups_flaggedById" FOREIGN KEY ("flaggedById")
          REFERENCES "users"("id") ON DELETE SET NULL
    `);
		await queryRunner.query(
			`CREATE INDEX "IDX_meetups_flaggedAt" ON "meetups" ("flaggedAt") WHERE "flaggedAt" IS NOT NULL`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX "IDX_meetups_flaggedAt"`);
		await queryRunner.query(`
      ALTER TABLE "meetups"
        DROP CONSTRAINT "FK_meetups_flaggedById",
        DROP COLUMN "flagReason",
        DROP COLUMN "flaggedById",
        DROP COLUMN "flaggedAt"
    `);
		// Postgres cannot remove a value from an enum; meetup_safety_check stays.
	}
}
