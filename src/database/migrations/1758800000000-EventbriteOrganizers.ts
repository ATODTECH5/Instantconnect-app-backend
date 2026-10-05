import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The organizers the Eventbrite import reads, moved out of an env var so an
 * admin can change them without a redeploy. Seeded with the Lagos organizers
 * the env var held; their names arrive with the first sync. Imported events
 * now record their organizer, so one organizer failing or being removed only
 * touches its own events.
 */
export class EventbriteOrganizers1758800000000 implements MigrationInterface {
	name = 'EventbriteOrganizers1758800000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
      CREATE TABLE "eventbrite_organizers" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "organizerId" varchar(32) NOT NULL,
        "name" varchar(160),
        "isActive" boolean NOT NULL DEFAULT true,
        "lastSyncedAt" TIMESTAMP WITH TIME ZONE,
        "lastSyncError" varchar(500),
        "addedById" uuid,
        CONSTRAINT "PK_eventbrite_organizers_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_eventbrite_organizers_organizerId" UNIQUE ("organizerId"),
        CONSTRAINT "FK_eventbrite_organizers_addedById" FOREIGN KEY ("addedById")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
		await queryRunner.query(`
      INSERT INTO "eventbrite_organizers" ("organizerId") VALUES
        ('4462726935'), ('121630922975'), ('121720758452'), ('120765177886'),
        ('116891606371'), ('121619957752'), ('17632244739'), ('103408812881'),
        ('48120067983'), ('34875450133'), ('121540406766'), ('28264023857'),
        ('55184857743')
    `);
		await queryRunner.query(
			`ALTER TABLE "events" ADD "externalOrganizerId" varchar(32)`,
		);
		await queryRunner.query(`
      CREATE INDEX "IDX_events_externalOrganizerId"
        ON "events" ("externalOrganizerId")
        WHERE "externalOrganizerId" IS NOT NULL
    `);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX "IDX_events_externalOrganizerId"`);
		await queryRunner.query(
			`ALTER TABLE "events" DROP COLUMN "externalOrganizerId"`,
		);
		await queryRunner.query(`DROP TABLE "eventbrite_organizers"`);
	}
}
