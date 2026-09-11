import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gives the bell on Home and the Notifications screen something real to read.
 * Both have existed as UI since the first build: the bell's count was
 * hard-coded to zero and the screen was a placeholder.
 *
 * No rendered text is stored. A row says what kind of thing happened, who
 * caused it and what to open; the title and body are written at read time from
 * the actor as they are now. Storing the copy would freeze someone's old name
 * into every notification that ever mentioned them.
 *
 * Indexed on (userId, createdAt) because every read is one person's list in
 * reverse chronological order, which is exactly that index walked backwards.
 * The unread count filters the same prefix, so it rides along.
 */
export class Notifications1757200000000 implements MigrationInterface {
	name = 'Notifications1757200000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE TYPE "notifications_kind_enum" AS ENUM('message', 'connection_request', 'connection_accepted')`,
		);
		await queryRunner.query(`
			CREATE TABLE "notifications" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"userId" uuid NOT NULL,
				"kind" "notifications_kind_enum" NOT NULL,
				"actorId" uuid,
				"subjectId" uuid,
				"readAt" TIMESTAMP WITH TIME ZONE,
				CONSTRAINT "PK_notifications_id" PRIMARY KEY ("id"),
				CONSTRAINT "FK_notifications_userId" FOREIGN KEY ("userId")
					REFERENCES "users"("id") ON DELETE CASCADE,
				CONSTRAINT "FK_notifications_actorId" FOREIGN KEY ("actorId")
					REFERENCES "users"("id") ON DELETE CASCADE
			)
		`);
		await queryRunner.query(
			`CREATE INDEX "IDX_notifications_userId_createdAt" ON "notifications" ("userId", "createdAt")`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`DROP INDEX "IDX_notifications_userId_createdAt"`,
		);
		await queryRunner.query(`DROP TABLE "notifications"`);
		await queryRunner.query(`DROP TYPE "notifications_kind_enum"`);
	}
}
