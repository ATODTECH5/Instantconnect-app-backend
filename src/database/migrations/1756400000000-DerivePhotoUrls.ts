import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Delivery URLs are now derived from `storageId` per size rather than stored,
 * so the column held a second, provider specific copy of the same fact that
 * would go stale the moment storage moved.
 */
export class DerivePhotoUrls1756400000000 implements MigrationInterface {
	name = 'DerivePhotoUrls1756400000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "user_photos" DROP COLUMN "url"`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "user_photos" ADD "url" character varying(500) NOT NULL DEFAULT ''`,
		);
		await queryRunner.query(
			`ALTER TABLE "user_photos" ALTER COLUMN "url" DROP DEFAULT`,
		);
	}
}
