import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Safety circles and dispatch, Phase 3 steps 13 and 14.
 *
 * A circle's members are outside contacts, not accounts: the people you
 * would want told that you arrived safely are your family and flatmates,
 * who are almost never on the app. So a member is a name and an email,
 * nothing more, and dispatch goes by email. SMS is a later channel; the
 * `phone` column is here so adding it is not a migration.
 *
 * `meetup_circle_selections` records which circles a participant chose for
 * one meetup. Chosen per meetup rather than a default on the circle, because
 * who should know depends on the meetup: a coffee with a colleague and a
 * first date do not warrant the same audience.
 *
 * `safety_dispatches` is the audit of what was actually sent: one row per
 * meetup, participant, trigger and recipient. It is what "your circles were
 * told" rests on, and it is idempotent by the unique index, so a retried
 * request cannot email the same person twice for the same trigger.
 */
export class SafetyCircles1757600000000 implements MigrationInterface {
	name = 'SafetyCircles1757600000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE TYPE "safety_dispatches_trigger_enum" AS ENUM('verified', 'ended', 'manual')`,
		);
		await queryRunner.query(
			`CREATE TYPE "safety_dispatches_status_enum" AS ENUM('sent', 'failed')`,
		);

		await queryRunner.query(`
      CREATE TABLE "safety_circles" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "ownerId" uuid NOT NULL,
        "name" character varying(60) NOT NULL,
        CONSTRAINT "PK_safety_circles_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_safety_circles_ownerId" FOREIGN KEY ("ownerId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
		await queryRunner.query(
			`CREATE INDEX "IDX_safety_circles_ownerId" ON "safety_circles" ("ownerId")`,
		);

		await queryRunner.query(`
      CREATE TABLE "safety_circle_members" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "circleId" uuid NOT NULL,
        "name" character varying(80) NOT NULL,
        "email" character varying(255) NOT NULL,
        "phone" character varying(20),
        CONSTRAINT "PK_safety_circle_members_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_safety_circle_members_circleId_email" UNIQUE ("circleId", "email"),
        CONSTRAINT "FK_safety_circle_members_circleId" FOREIGN KEY ("circleId")
          REFERENCES "safety_circles"("id") ON DELETE CASCADE
      )
    `);

		await queryRunner.query(`
      CREATE TABLE "meetup_circle_selections" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "participantId" uuid NOT NULL,
        "circleId" uuid NOT NULL,
        CONSTRAINT "PK_meetup_circle_selections_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_meetup_circle_selections_participantId_circleId" UNIQUE ("participantId", "circleId"),
        CONSTRAINT "FK_meetup_circle_selections_participantId" FOREIGN KEY ("participantId")
          REFERENCES "meetup_participants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_meetup_circle_selections_circleId" FOREIGN KEY ("circleId")
          REFERENCES "safety_circles"("id") ON DELETE CASCADE
      )
    `);

		await queryRunner.query(`
      CREATE TABLE "safety_dispatches" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "participantId" uuid NOT NULL,
        "trigger" "safety_dispatches_trigger_enum" NOT NULL,
        "recipientEmail" character varying(255) NOT NULL,
        "recipientName" character varying(80) NOT NULL,
        "status" "safety_dispatches_status_enum" NOT NULL,
        CONSTRAINT "PK_safety_dispatches_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_safety_dispatches_participantId" FOREIGN KEY ("participantId")
          REFERENCES "meetup_participants"("id") ON DELETE CASCADE
      )
    `);
		await queryRunner.query(
			`CREATE UNIQUE INDEX "UQ_safety_dispatches_once" ON "safety_dispatches" ("participantId", "trigger", "recipientEmail") WHERE "status" = 'sent'`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE "safety_dispatches"`);
		await queryRunner.query(`DROP TABLE "meetup_circle_selections"`);
		await queryRunner.query(`DROP TABLE "safety_circle_members"`);
		await queryRunner.query(`DROP TABLE "safety_circles"`);
		await queryRunner.query(`DROP TYPE "safety_dispatches_status_enum"`);
		await queryRunner.query(`DROP TYPE "safety_dispatches_trigger_enum"`);
	}
}
