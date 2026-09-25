import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hosted events, from the Profile's Create Event flow.
 *
 * Price is stored in kobo with no ticketing behind it: there is no payment
 * provider yet, so a paid event shows its price and nothing can be bought.
 * Checkout will add its own tables beside this one rather than change it.
 *
 * `event_invites` holds only whom the host invited. Attendance (joining,
 * cancelling) is a separate decision, so it gets its own table when it is
 * built rather than a status column here that no one could yet set.
 *
 * `venueLocation` is required, unlike a meetup's: the location picker always
 * resolves a point, and distance on the event card needs one.
 */
export class Events1758000000000 implements MigrationInterface {
	name = 'Events1758000000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TYPE "notifications_kind_enum" ADD VALUE IF NOT EXISTS 'event_invite'`,
		);

		await queryRunner.query(`
      CREATE TABLE "events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "hostId" uuid NOT NULL,
        "title" character varying(80) NOT NULL,
        "description" character varying(1000),
        "startsAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "endsAt" TIMESTAMP WITH TIME ZONE,
        "venueName" character varying(120) NOT NULL,
        "venueAddress" character varying(255),
        "venueLocation" geography(Point,4326) NOT NULL,
        "categoryId" character varying(32),
        "priceMinor" integer NOT NULL DEFAULT 0,
        "isPublic" boolean NOT NULL DEFAULT true,
        "coverStorageId" character varying(255),
        CONSTRAINT "PK_events_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_events_priceMinor" CHECK ("priceMinor" >= 0),
        CONSTRAINT "CHK_events_endsAt" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt"),
        CONSTRAINT "FK_events_hostId" FOREIGN KEY ("hostId")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_events_categoryId" FOREIGN KEY ("categoryId")
          REFERENCES "categories"("id") ON DELETE SET NULL
      )
    `);
		await queryRunner.query(
			`CREATE INDEX "IDX_events_hostId_startsAt" ON "events" ("hostId", "startsAt")`,
		);

		await queryRunner.query(`
      CREATE TABLE "event_invites" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "eventId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        CONSTRAINT "PK_event_invites_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_event_invites_eventId_userId" UNIQUE ("eventId", "userId"),
        CONSTRAINT "FK_event_invites_eventId" FOREIGN KEY ("eventId")
          REFERENCES "events"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_event_invites_userId" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
		await queryRunner.query(
			`CREATE INDEX "IDX_event_invites_userId" ON "event_invites" ("userId")`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE "event_invites"`);
		await queryRunner.query(`DROP TABLE "events"`);
		// Postgres cannot remove a value from an enum; event_invite stays.
	}
}
