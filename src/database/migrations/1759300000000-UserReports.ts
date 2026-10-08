import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Members reporting other members, from a profile or a chat. App Store
 * guideline 1.2 requires a way to report people in apps where strangers
 * contact each other; blocking alone is not enough.
 */
export class UserReports1759300000000 implements MigrationInterface {
	name = 'UserReports1759300000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE TYPE "user_reports_reason_enum" AS ENUM ('harassment', 'fake_profile', 'spam', 'inappropriate_content', 'safety_concern', 'underage', 'other')`,
		);
		await queryRunner.query(
			`CREATE TYPE "user_reports_source_enum" AS ENUM ('profile', 'chat')`,
		);
		await queryRunner.query(
			`CREATE TYPE "user_reports_status_enum" AS ENUM ('open', 'dismissed', 'resolved')`,
		);
		await queryRunner.query(`
      CREATE TABLE "user_reports" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "reporterId" uuid NOT NULL,
        "reportedUserId" uuid NOT NULL,
        "reason" "user_reports_reason_enum" NOT NULL,
        "details" varchar(1000),
        "source" "user_reports_source_enum" NOT NULL,
        "status" "user_reports_status_enum" NOT NULL DEFAULT 'open',
        "reviewedById" uuid,
        "reviewedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_user_reports_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_reports_reporterId" FOREIGN KEY ("reporterId")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_reports_reportedUserId" FOREIGN KEY ("reportedUserId")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_reports_reviewedById" FOREIGN KEY ("reviewedById")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
		await queryRunner.query(
			`CREATE INDEX "IDX_user_reports_status_createdAt" ON "user_reports" ("status", "createdAt")`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_user_reports_reportedUserId" ON "user_reports" ("reportedUserId")`,
		);
		await queryRunner.query(
			`CREATE UNIQUE INDEX "UQ_user_reports_open_pair" ON "user_reports" ("reporterId", "reportedUserId") WHERE "status" = 'open'`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE "user_reports"`);
		await queryRunner.query(`DROP TYPE "user_reports_status_enum"`);
		await queryRunner.query(`DROP TYPE "user_reports_source_enum"`);
		await queryRunner.query(`DROP TYPE "user_reports_reason_enum"`);
	}
}
