import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Remote push, the half of notifications that reaches a closed app. The
 * in-app half has existed since 1757200000000; this only records where each
 * account's installs can be reached.
 *
 * The token is unique across the table rather than per user, because it names
 * an install, not a person. Signing in as someone else on the same phone moves
 * the row instead of leaving the first account still receiving pushes there.
 *
 * Indexed on userId because the only read is "every device for this person",
 * once per notification raised.
 */
export class PushTokens1758600000000 implements MigrationInterface {
	name = 'PushTokens1758600000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE TYPE "push_tokens_platform_enum" AS ENUM('ios', 'android')`,
		);
		await queryRunner.query(`
			CREATE TABLE "push_tokens" (
				"id" uuid NOT NULL DEFAULT gen_random_uuid(),
				"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				"userId" uuid NOT NULL,
				"token" text NOT NULL,
				"platform" "push_tokens_platform_enum" NOT NULL,
				CONSTRAINT "PK_push_tokens_id" PRIMARY KEY ("id"),
				CONSTRAINT "UQ_push_tokens_token" UNIQUE ("token"),
				CONSTRAINT "FK_push_tokens_userId" FOREIGN KEY ("userId")
					REFERENCES "users"("id") ON DELETE CASCADE
			)
		`);
		await queryRunner.query(
			`CREATE INDEX "IDX_push_tokens_userId" ON "push_tokens" ("userId")`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX "IDX_push_tokens_userId"`);
		await queryRunner.query(`DROP TABLE "push_tokens"`);
		await queryRunner.query(`DROP TYPE "push_tokens_platform_enum"`);
	}
}
