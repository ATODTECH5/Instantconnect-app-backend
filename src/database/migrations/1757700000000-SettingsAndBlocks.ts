import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Settings and Blocked Users, Phase 7 steps 26 and 27.
 *
 * Three more verification purposes, since a change of email, a change of
 * phone and a deletion each need their own single-use code and must not be
 * able to spend one another's. The pending email and phone sit on `users`
 * until their code is confirmed, so the value the account still signs in
 * with is never replaced by one nobody has proven they can read.
 *
 * `twoFactorEnabled` is a preference with nothing behind it yet, kept so
 * the toggle on Password & Security is honest about what it stores.
 *
 * `notification_preferences` is one row per account, created lazily with
 * the frame's defaults. `blocks` is directional and unique per pair; the
 * effects (hidden from discovery, connection removed, chat refused) live in
 * the services rather than in triggers, so they are readable and testable.
 */
export class SettingsAndBlocks1757700000000 implements MigrationInterface {
	name = 'SettingsAndBlocks1757700000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TYPE "verification_codes_purpose_enum" ADD VALUE IF NOT EXISTS 'email_change'`,
		);
		await queryRunner.query(
			`ALTER TYPE "verification_codes_purpose_enum" ADD VALUE IF NOT EXISTS 'phone_change'`,
		);
		await queryRunner.query(
			`ALTER TYPE "verification_codes_purpose_enum" ADD VALUE IF NOT EXISTS 'account_deletion'`,
		);

		await queryRunner.query(
			`ALTER TABLE "users" ADD COLUMN "twoFactorEnabled" boolean NOT NULL DEFAULT false`,
		);
		await queryRunner.query(
			`ALTER TABLE "users" ADD COLUMN "pendingEmail" character varying(255)`,
		);
		await queryRunner.query(
			`ALTER TABLE "users" ADD COLUMN "pendingPhone" character varying(20)`,
		);
		await queryRunner.query(
			`ALTER TABLE "users" ADD COLUMN "deletionReason" character varying(64)`,
		);
		await queryRunner.query(
			`ALTER TABLE "users" ADD COLUMN "deletionDetails" text`,
		);

		await queryRunner.query(`
      CREATE TABLE "notification_preferences" (
        "userId" uuid NOT NULL,
        "pushEnabled" boolean NOT NULL DEFAULT true,
        "pushEventReminders" boolean NOT NULL DEFAULT true,
        "pushNewConnections" boolean NOT NULL DEFAULT true,
        "pushMessages" boolean NOT NULL DEFAULT true,
        "pushCommunityUpdates" boolean NOT NULL DEFAULT true,
        "emailEnabled" boolean NOT NULL DEFAULT true,
        "emailEventInvites" boolean NOT NULL DEFAULT true,
        "emailWeeklyDigest" boolean NOT NULL DEFAULT false,
        "emailPromotions" boolean NOT NULL DEFAULT false,
        "inAppEnabled" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification_preferences_userId" PRIMARY KEY ("userId"),
        CONSTRAINT "FK_notification_preferences_userId" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

		await queryRunner.query(`
      CREATE TABLE "blocks" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "blockerId" uuid NOT NULL,
        "blockedId" uuid NOT NULL,
        CONSTRAINT "PK_blocks_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_blocks_blockerId" FOREIGN KEY ("blockerId")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_blocks_blockedId" FOREIGN KEY ("blockedId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
		await queryRunner.query(
			`CREATE UNIQUE INDEX "UQ_blocks_blockerId_blockedId" ON "blocks" ("blockerId", "blockedId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_blocks_blockedId" ON "blocks" ("blockedId")`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE "blocks"`);
		await queryRunner.query(`DROP TABLE "notification_preferences"`);
		await queryRunner.query(
			`ALTER TABLE "users" DROP COLUMN "deletionDetails"`,
		);
		await queryRunner.query(
			`ALTER TABLE "users" DROP COLUMN "deletionReason"`,
		);
		await queryRunner.query(
			`ALTER TABLE "users" DROP COLUMN "pendingPhone"`,
		);
		await queryRunner.query(
			`ALTER TABLE "users" DROP COLUMN "pendingEmail"`,
		);
		await queryRunner.query(
			`ALTER TABLE "users" DROP COLUMN "twoFactorEnabled"`,
		);
		// Postgres cannot remove a value from an enum; the three purposes stay.
	}
}
