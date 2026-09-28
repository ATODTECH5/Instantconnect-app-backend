import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Who is going to an event. Leaving deletes the row rather than flagging it:
 * nothing reads a history of cancellations yet, and the unique pair keeps
 * joining idempotent. Paid events cannot be joined until checkout exists, so
 * a row here never implies a ticket was bought.
 */
export class EventAttendees1758200000000 implements MigrationInterface {
	name = 'EventAttendees1758200000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TYPE "notifications_kind_enum" ADD VALUE IF NOT EXISTS 'event_joined'`,
		);

		await queryRunner.query(`
      CREATE TABLE "event_attendees" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "eventId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        CONSTRAINT "PK_event_attendees_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_event_attendees_eventId_userId" UNIQUE ("eventId", "userId"),
        CONSTRAINT "FK_event_attendees_eventId" FOREIGN KEY ("eventId")
          REFERENCES "events"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_event_attendees_userId" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
		await queryRunner.query(
			`CREATE INDEX "IDX_event_attendees_userId" ON "event_attendees" ("userId")`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE "event_attendees"`);
		// Postgres cannot remove a value from an enum; event_joined stays.
	}
}
