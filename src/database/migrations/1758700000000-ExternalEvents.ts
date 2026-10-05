import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Events imported from third party listings live beside member events so they
 * share the nearby list, attendance and the detail screen. An imported event
 * has no host: the check constraint makes every row either hosted by a member
 * or tied to a source, never neither. The partial unique index is what makes
 * the sync an idempotent upsert.
 */
export class ExternalEvents1758700000000 implements MigrationInterface {
	name = 'ExternalEvents1758700000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE TYPE "events_externalsource_enum" AS ENUM ('eventbrite')`,
		);
		await queryRunner.query(`
      ALTER TABLE "events"
        ALTER COLUMN "hostId" DROP NOT NULL,
        ADD "externalSource" "events_externalsource_enum",
        ADD "externalId" varchar(64),
        ADD "externalUrl" varchar(500),
        ADD "externalCoverUrl" varchar(500),
        ADD "organizerName" varchar(120),
        ADD CONSTRAINT "CHK_events_host_or_source"
          CHECK ("hostId" IS NOT NULL OR "externalSource" IS NOT NULL)
    `);
		await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_events_externalSource_externalId"
        ON "events" ("externalSource", "externalId")
        WHERE "externalSource" IS NOT NULL
    `);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`DELETE FROM "events" WHERE "externalSource" IS NOT NULL`,
		);
		await queryRunner.query(
			`DROP INDEX "UQ_events_externalSource_externalId"`,
		);
		await queryRunner.query(`
      ALTER TABLE "events"
        DROP CONSTRAINT "CHK_events_host_or_source",
        DROP COLUMN "organizerName",
        DROP COLUMN "externalCoverUrl",
        DROP COLUMN "externalUrl",
        DROP COLUMN "externalId",
        DROP COLUMN "externalSource",
        ALTER COLUMN "hostId" SET NOT NULL
    `);
		await queryRunner.query(`DROP TYPE "events_externalsource_enum"`);
	}
}
