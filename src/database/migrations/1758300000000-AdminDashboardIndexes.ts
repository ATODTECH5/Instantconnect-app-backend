import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The admin dashboard's activity feed reads each table newest first, and its
 * growth chart and 30 day comparisons range over creation time. Without these
 * every overview load scans users, events and KYC submissions in full.
 */
export class AdminDashboardIndexes1758300000000 implements MigrationInterface {
	name = 'AdminDashboardIndexes1758300000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE INDEX "IDX_users_createdAt" ON "users" ("createdAt")`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_events_createdAt" ON "events" ("createdAt")`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_kyc_submissions_createdAt" ON "kyc_submissions" ("createdAt")`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX "IDX_kyc_submissions_createdAt"`);
		await queryRunner.query(`DROP INDEX "IDX_events_createdAt"`);
		await queryRunner.query(`DROP INDEX "IDX_users_createdAt"`);
	}
}
