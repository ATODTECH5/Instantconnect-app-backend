import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * KYC, Phase 6 step 23, decided without a provider: an admin reviews and
 * the account is notified. A provider that answers automatically would take
 * the reviewer's seat and nothing in the schema would move.
 *
 * `kyc_submissions` keeps every attempt, since a rejection is only useful
 * next to what it was based on. The partial unique index is the rule that an
 * account has at most one submission awaiting review. Every storage id in
 * the row points at an authenticated asset: the plain delivery scheme
 * refuses them, so a leaked id is not a leaked document.
 */
export class Kyc1757900000000 implements MigrationInterface {
	name = 'Kyc1757900000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TYPE "notifications_kind_enum" ADD VALUE IF NOT EXISTS 'kyc_approved'`,
		);
		await queryRunner.query(
			`ALTER TYPE "notifications_kind_enum" ADD VALUE IF NOT EXISTS 'kyc_rejected'`,
		);

		await queryRunner.query(
			`CREATE TYPE "kyc_submissions_status_enum" AS ENUM('pending', 'approved', 'rejected')`,
		);
		await queryRunner.query(
			`CREATE TYPE "kyc_submissions_additionalidkind_enum" AS ENUM('passport', 'drivers_license')`,
		);
		await queryRunner.query(`
      CREATE TABLE "kyc_submissions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "userId" uuid NOT NULL,
        "status" "kyc_submissions_status_enum" NOT NULL DEFAULT 'pending',
        "nationalIdStorageId" character varying(255) NOT NULL,
        "additionalIdKind" "kyc_submissions_additionalidkind_enum" NOT NULL,
        "additionalIdStorageId" character varying(255) NOT NULL,
        "addressLine" character varying(200) NOT NULL,
        "country" character varying(80) NOT NULL,
        "state" character varying(80) NOT NULL,
        "city" character varying(80) NOT NULL,
        "utilityBillStorageId" character varying(255) NOT NULL,
        "kinName" character varying(80) NOT NULL,
        "kinRelationship" character varying(20) NOT NULL,
        "kinPhone" character varying(16) NOT NULL,
        "kinEmail" character varying(255) NOT NULL,
        "kinAddress" character varying(200) NOT NULL,
        "selfieStorageId" character varying(255) NOT NULL,
        "reviewedAt" TIMESTAMP WITH TIME ZONE,
        "reviewedById" uuid,
        "rejectionReason" character varying(300),
        CONSTRAINT "PK_kyc_submissions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_kyc_submissions_userId" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_kyc_submissions_reviewedById" FOREIGN KEY ("reviewedById")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
		await queryRunner.query(
			`CREATE INDEX "IDX_kyc_submissions_status_createdAt" ON "kyc_submissions" ("status", "createdAt")`,
		);
		await queryRunner.query(
			`CREATE UNIQUE INDEX "UQ_kyc_submissions_userId_pending" ON "kyc_submissions" ("userId") WHERE "status" = 'pending'`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE "kyc_submissions"`);
		await queryRunner.query(
			`DROP TYPE "kyc_submissions_additionalidkind_enum"`,
		);
		await queryRunner.query(`DROP TYPE "kyc_submissions_status_enum"`);
		// Postgres cannot remove a value from an enum; the two kyc kinds stay.
	}
}
