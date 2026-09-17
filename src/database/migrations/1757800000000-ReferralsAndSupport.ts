import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Refer a Friend and Help & Support, Phase 7 steps 29 and 30.
 *
 * `users.referralCode` is minted lazily the first time an account opens the
 * Refer screen, so it is nullable and the unique index is partial. A
 * `referrals` row is written when someone registers with a code; its state
 * is not stored, because "joined" simply means the referee has verified
 * their email, and a second copy of that fact would drift.
 *
 * `support_messages` is one thread per account. `inbound` rows are what the
 * account typed in Live Chat, `outbound` rows are replies from the team,
 * which is why only those carry an agent name and a subject.
 */
export class ReferralsAndSupport1757800000000 implements MigrationInterface {
	name = 'ReferralsAndSupport1757800000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TYPE "notifications_kind_enum" ADD VALUE IF NOT EXISTS 'referral_joined'`,
		);

		await queryRunner.query(
			`ALTER TABLE "users" ADD COLUMN "referralCode" character varying(16)`,
		);
		await queryRunner.query(
			`CREATE UNIQUE INDEX "UQ_users_referralCode" ON "users" ("referralCode") WHERE "referralCode" IS NOT NULL`,
		);

		await queryRunner.query(`
      CREATE TABLE "referrals" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "referrerId" uuid NOT NULL,
        "refereeId" uuid NOT NULL,
        CONSTRAINT "PK_referrals_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_referrals_refereeId" UNIQUE ("refereeId"),
        CONSTRAINT "FK_referrals_referrerId" FOREIGN KEY ("referrerId")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_referrals_refereeId" FOREIGN KEY ("refereeId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
		await queryRunner.query(
			`CREATE INDEX "IDX_referrals_referrerId_createdAt" ON "referrals" ("referrerId", "createdAt")`,
		);

		await queryRunner.query(
			`CREATE TYPE "support_messages_direction_enum" AS ENUM('inbound', 'outbound')`,
		);
		await queryRunner.query(`
      CREATE TABLE "support_messages" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "userId" uuid NOT NULL,
        "direction" "support_messages_direction_enum" NOT NULL,
        "agentName" character varying(80),
        "subject" character varying(120),
        "body" text NOT NULL,
        CONSTRAINT "PK_support_messages_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_support_messages_userId" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
		await queryRunner.query(
			`CREATE INDEX "IDX_support_messages_userId_createdAt" ON "support_messages" ("userId", "createdAt")`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE "support_messages"`);
		await queryRunner.query(`DROP TYPE "support_messages_direction_enum"`);
		await queryRunner.query(`DROP TABLE "referrals"`);
		await queryRunner.query(`DROP INDEX "UQ_users_referralCode"`);
		await queryRunner.query(
			`ALTER TABLE "users" DROP COLUMN "referralCode"`,
		);
		// Postgres cannot remove a value from an enum; `referral_joined` stays.
	}
}
