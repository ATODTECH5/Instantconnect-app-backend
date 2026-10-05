import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The Notifications, Security and Content Moderation tabs of the admin
 * Settings page, limited to what the server enforces: platform wide push
 * categories, an admin alert for new KYC submissions, sign-in lockout, how
 * long a kept session lasts, and blocked words and link domains. The lockout
 * counters live on the user they protect.
 */
export class EnforcedSettings1758900000000 implements MigrationInterface {
	name = 'EnforcedSettings1758900000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
      ALTER TABLE "platform_settings"
        ADD "pushMessages" boolean NOT NULL DEFAULT true,
        ADD "pushConnections" boolean NOT NULL DEFAULT true,
        ADD "pushEvents" boolean NOT NULL DEFAULT true,
        ADD "pushMeetups" boolean NOT NULL DEFAULT true,
        ADD "pushKyc" boolean NOT NULL DEFAULT true,
        ADD "kycSubmittedAlert" boolean NOT NULL DEFAULT false,
        ADD "adminAlertEmails" text[] NOT NULL DEFAULT '{}',
        ADD "lockoutEnabled" boolean NOT NULL DEFAULT true,
        ADD "lockoutMaxAttempts" smallint NOT NULL DEFAULT 5,
        ADD "lockoutMinutes" smallint NOT NULL DEFAULT 15,
        ADD "keepSignedInDays" smallint NOT NULL DEFAULT 30,
        ADD "blockedWords" text[] NOT NULL DEFAULT '{}',
        ADD "blockedDomains" text[] NOT NULL DEFAULT '{}'
    `);
		await queryRunner.query(`
      ALTER TABLE "users"
        ADD "failedSignInAttempts" smallint NOT NULL DEFAULT 0,
        ADD "lockedUntil" TIMESTAMP WITH TIME ZONE
    `);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN "lockedUntil",
        DROP COLUMN "failedSignInAttempts"
    `);
		await queryRunner.query(`
      ALTER TABLE "platform_settings"
        DROP COLUMN "blockedDomains",
        DROP COLUMN "blockedWords",
        DROP COLUMN "keepSignedInDays",
        DROP COLUMN "lockoutMinutes",
        DROP COLUMN "lockoutMaxAttempts",
        DROP COLUMN "lockoutEnabled",
        DROP COLUMN "adminAlertEmails",
        DROP COLUMN "kycSubmittedAlert",
        DROP COLUMN "pushKyc",
        DROP COLUMN "pushMeetups",
        DROP COLUMN "pushEvents",
        DROP COLUMN "pushConnections",
        DROP COLUMN "pushMessages"
    `);
	}
}
