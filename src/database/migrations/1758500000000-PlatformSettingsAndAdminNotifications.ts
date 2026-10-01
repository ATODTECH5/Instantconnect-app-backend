import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Platform Settings keeps only what the server enforces, in a single pinned
 * row seeded with today's behaviour, so applying this changes nothing until an
 * admin flips a switch. Admin notifications are derived from KYC submissions,
 * support messages and events; only each admin's read marks are stored. The
 * partial index serves the bell's scan of inbound support messages.
 */
export class PlatformSettingsAndAdminNotifications1758500000000 implements MigrationInterface {
	name = 'PlatformSettingsAndAdminNotifications1758500000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
      CREATE TABLE "platform_settings" (
        "id" smallint NOT NULL DEFAULT 1,
        "maintenanceMode" boolean NOT NULL DEFAULT false,
        "allowNewRegistrations" boolean NOT NULL DEFAULT true,
        "minimumAge" smallint NOT NULL DEFAULT 18,
        "kycRequiredToJoinEvents" boolean NOT NULL DEFAULT false,
        "kycRequiredToCreateEvents" boolean NOT NULL DEFAULT false,
        "allowPaidEvents" boolean NOT NULL DEFAULT true,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedById" uuid,
        CONSTRAINT "PK_platform_settings_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_platform_settings_single_row" CHECK ("id" = 1),
        CONSTRAINT "FK_platform_settings_updatedById" FOREIGN KEY ("updatedById")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
		await queryRunner.query(
			`INSERT INTO "platform_settings" ("id") VALUES (1)`,
		);

		await queryRunner.query(`
      CREATE TABLE "admin_notification_reads" (
        "adminId" uuid NOT NULL,
        "notificationId" character varying(80) NOT NULL,
        "readAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_admin_notification_reads" PRIMARY KEY ("adminId", "notificationId"),
        CONSTRAINT "FK_admin_notification_reads_adminId" FOREIGN KEY ("adminId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
		await queryRunner.query(`
      CREATE TABLE "admin_notification_cursors" (
        "adminId" uuid NOT NULL,
        "readAllAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_admin_notification_cursors" PRIMARY KEY ("adminId"),
        CONSTRAINT "FK_admin_notification_cursors_adminId" FOREIGN KEY ("adminId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
		await queryRunner.query(
			`CREATE INDEX "IDX_support_messages_inbound_createdAt" ON "support_messages" ("createdAt") WHERE "direction" = 'inbound'`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`DROP INDEX "IDX_support_messages_inbound_createdAt"`,
		);
		await queryRunner.query(`DROP TABLE "admin_notification_cursors"`);
		await queryRunner.query(`DROP TABLE "admin_notification_reads"`);
		await queryRunner.query(`DROP TABLE "platform_settings"`);
	}
}
