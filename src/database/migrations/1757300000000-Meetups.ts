import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The meetup lifecycle: the reason the product exists, and the first Phase 3
 * table. Everything later in the phase (arrival codes, live location, safety
 * dispatch) hangs off these two rows rather than adding tables of its own.
 *
 * A meetup belongs to a conversation, never to a connection directly, because
 * it is proposed, answered and confirmed inside the thread and the cards that
 * drive it are messages. That is also why `messages` gains a `meetupId`: a
 * card is a message pointing at the meetup it describes, and re-reads the
 * meetup's current state rather than a snapshot, so a proposal card stops
 * offering Accept the moment the other party has answered.
 *
 * Two levels of state. `meetups.status` is the meetup as a whole and moves
 * only on server-authoritative transitions. `meetup_participants.arrivalState`
 * is per party, because both people travel independently and each has their
 * own arrival, code and location; the meetup becomes `active` only when both
 * are verified. Arrival codes are a later migration on the participant row.
 *
 * `proposedTimes` is jsonb rather than a child table: a proposal carries one
 * to five candidate times, is answered once, and is never queried by time.
 *
 * `venueLocation` is a PostGIS point from day one because the arrival
 * geofence (step 12) needs a distance query against it, and adding a
 * geography column to a populated table later is the migration nobody wants.
 * Venue is free text until Places exists; a `placeId` can be added then.
 *
 * Partial unique index: one open meetup per conversation. Two proposals in
 * flight would mean two cards competing for the same answer.
 */
export class Meetups1757300000000 implements MigrationInterface {
	name = 'Meetups1757300000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE TYPE "meetups_status_enum" AS ENUM('proposed', 'scheduled', 'active', 'ended', 'declined', 'cancelled', 'expired')`,
		);
		await queryRunner.query(
			`CREATE TYPE "meetup_participants_arrivalstate_enum" AS ENUM('pending', 'en_route', 'arrived')`,
		);

		await queryRunner.query(`
      CREATE TABLE "meetups" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "conversationId" uuid NOT NULL,
        "proposerId" uuid NOT NULL,
        "inviteeId" uuid NOT NULL,
        "status" "meetups_status_enum" NOT NULL DEFAULT 'proposed',
        "awaitingUserId" uuid,
        "proposedTimes" jsonb NOT NULL DEFAULT '[]',
        "scheduledAt" TIMESTAMP WITH TIME ZONE,
        "venueName" character varying(120),
        "venueAddress" character varying(255),
        "venueLocation" geography(Point, 4326),
        "respondedAt" TIMESTAMP WITH TIME ZONE,
        "startedAt" TIMESTAMP WITH TIME ZONE,
        "endedAt" TIMESTAMP WITH TIME ZONE,
        "cancelledAt" TIMESTAMP WITH TIME ZONE,
        "cancelledById" uuid,
        CONSTRAINT "PK_meetups_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_meetups_conversationId" FOREIGN KEY ("conversationId")
          REFERENCES "conversations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_meetups_proposerId" FOREIGN KEY ("proposerId")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_meetups_inviteeId" FOREIGN KEY ("inviteeId")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_meetups_cancelledById" FOREIGN KEY ("cancelledById")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

		await queryRunner.query(
			`CREATE INDEX "IDX_meetups_conversationId_createdAt" ON "meetups" ("conversationId", "createdAt")`,
		);
		await queryRunner.query(
			`CREATE UNIQUE INDEX "UQ_meetups_one_open_per_conversation" ON "meetups" ("conversationId") WHERE "status" IN ('proposed', 'scheduled', 'active')`,
		);

		await queryRunner.query(`
      CREATE TABLE "meetup_participants" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "meetupId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "arrivalState" "meetup_participants_arrivalstate_enum" NOT NULL DEFAULT 'pending',
        "enRouteAt" TIMESTAMP WITH TIME ZONE,
        "arrivedAt" TIMESTAMP WITH TIME ZONE,
        "verifiedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_meetup_participants_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_meetup_participants_meetupId_userId" UNIQUE ("meetupId", "userId"),
        CONSTRAINT "FK_meetup_participants_meetupId" FOREIGN KEY ("meetupId")
          REFERENCES "meetups"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_meetup_participants_userId" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

		await queryRunner.query(
			`ALTER TABLE "messages" ADD COLUMN "meetupId" uuid`,
		);
		await queryRunner.query(
			`ALTER TABLE "messages" ADD CONSTRAINT "FK_messages_meetupId" FOREIGN KEY ("meetupId") REFERENCES "meetups"("id") ON DELETE SET NULL`,
		);

		// A card is content in its own right: it has neither body nor image,
		// and the meetup it points at is what the thread renders. The check
		// keeps its purpose (no empty rows) and gains a third way to satisfy it.
		await queryRunner.query(
			`ALTER TABLE "messages" DROP CONSTRAINT "CHK_messages_has_content"`,
		);
		await queryRunner.query(
			`ALTER TABLE "messages" ADD CONSTRAINT "CHK_messages_has_content" CHECK ("body" IS NOT NULL OR "mediaStorageId" IS NOT NULL OR "meetupId" IS NOT NULL)`,
		);

		// Added outside the enum's own transaction rules: Postgres lets a value be
		// added inside a transaction from 12 onward but not used in the same one,
		// and nothing here uses them.
		await queryRunner.query(
			`ALTER TYPE "notifications_kind_enum" ADD VALUE IF NOT EXISTS 'meetup_proposed'`,
		);
		await queryRunner.query(
			`ALTER TYPE "notifications_kind_enum" ADD VALUE IF NOT EXISTS 'meetup_accepted'`,
		);
		await queryRunner.query(
			`ALTER TYPE "notifications_kind_enum" ADD VALUE IF NOT EXISTS 'meetup_declined'`,
		);
		await queryRunner.query(
			`ALTER TYPE "notifications_kind_enum" ADD VALUE IF NOT EXISTS 'meetup_cancelled'`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "messages" DROP CONSTRAINT "CHK_messages_has_content"`,
		);
		await queryRunner.query(
			`ALTER TABLE "messages" ADD CONSTRAINT "CHK_messages_has_content" CHECK ("body" IS NOT NULL OR "mediaStorageId" IS NOT NULL)`,
		);
		await queryRunner.query(
			`ALTER TABLE "messages" DROP CONSTRAINT "FK_messages_meetupId"`,
		);
		await queryRunner.query(
			`ALTER TABLE "messages" DROP COLUMN "meetupId"`,
		);
		await queryRunner.query(`DROP TABLE "meetup_participants"`);
		await queryRunner.query(`DROP TABLE "meetups"`);
		await queryRunner.query(
			`DROP TYPE "meetup_participants_arrivalstate_enum"`,
		);
		await queryRunner.query(`DROP TYPE "meetups_status_enum"`);
		// Postgres cannot remove enum values; the four meetup kinds stay on the
		// notifications enum, unused, which is harmless.
	}
}
