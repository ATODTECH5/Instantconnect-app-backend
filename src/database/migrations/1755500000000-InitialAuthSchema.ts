import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Identifiers are quoted camelCase because the project keeps TypeORM's default
 * naming strategy, so raw SQL against these tables must quote them too.
 */
export class InitialAuthSchema1755500000000 implements MigrationInterface {
  name = 'InitialAuthSchema1755500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "users_role_enum" AS ENUM ('user', 'admin')
    `);
    await queryRunner.query(`
      CREATE TYPE "users_status_enum" AS ENUM ('pending_verification', 'active', 'suspended')
    `);
    await queryRunner.query(`
      CREATE TYPE "auth_identities_provider_enum" AS ENUM ('google', 'apple')
    `);
    await queryRunner.query(`
      CREATE TYPE "verification_codes_purpose_enum" AS ENUM ('email_verification', 'password_reset')
    `);

    await queryRunner.query(`
      CREATE TABLE "interests" (
        "id" character varying(32) NOT NULL,
        "label" character varying(64) NOT NULL,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_interests" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "fullName" character varying(80) NOT NULL,
        "email" character varying(255) NOT NULL,
        "phone" character varying(20) NOT NULL,
        "passwordHash" character varying(255),
        "role" "users_role_enum" NOT NULL DEFAULT 'user',
        "status" "users_status_enum" NOT NULL DEFAULT 'pending_verification',
        "emailVerifiedAt" TIMESTAMP WITH TIME ZONE,
        "termsAcceptedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "pinEnabled" boolean NOT NULL DEFAULT false,
        "biometricsEnabled" boolean NOT NULL DEFAULT false,
        "lastSignedInAt" TIMESTAMP WITH TIME ZONE,
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);

    // Partial, so a soft deleted account releases its email and phone instead
    // of reserving them forever.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_users_email_active" ON "users" ("email") WHERE "deletedAt" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_users_phone_active" ON "users" ("phone") WHERE "deletedAt" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "auth_identities" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "userId" uuid NOT NULL,
        "provider" "auth_identities_provider_enum" NOT NULL,
        "providerAccountId" character varying(255) NOT NULL,
        "email" character varying(255),
        CONSTRAINT "PK_auth_identities" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_auth_identities_provider_account" UNIQUE ("provider", "providerAccountId"),
        CONSTRAINT "FK_auth_identities_userId" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "userId" uuid NOT NULL,
        "tokenHash" character varying(64) NOT NULL,
        "familyId" uuid NOT NULL,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "revokedAt" TIMESTAMP WITH TIME ZONE,
        "userAgent" character varying(255),
        "ipAddress" character varying(45),
        CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "FK_refresh_tokens_userId" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_refresh_tokens_tokenHash" ON "refresh_tokens" ("tokenHash")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_refresh_tokens_userId" ON "refresh_tokens" ("userId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_refresh_tokens_familyId" ON "refresh_tokens" ("familyId")
    `);

    await queryRunner.query(`
      CREATE TABLE "verification_codes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "userId" uuid NOT NULL,
        "purpose" "verification_codes_purpose_enum" NOT NULL,
        "codeHash" character varying(255) NOT NULL,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "consumedAt" TIMESTAMP WITH TIME ZONE,
        "attempts" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_verification_codes" PRIMARY KEY ("id"),
        CONSTRAINT "FK_verification_codes_userId" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_verification_codes_userId_purpose"
        ON "verification_codes" ("userId", "purpose")
    `);

    await queryRunner.query(`
      CREATE TABLE "user_interests" (
        "userId" uuid NOT NULL,
        "interestId" character varying(32) NOT NULL,
        CONSTRAINT "PK_user_interests" PRIMARY KEY ("userId", "interestId"),
        CONSTRAINT "FK_user_interests_userId" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "FK_user_interests_interestId" FOREIGN KEY ("interestId")
          REFERENCES "interests"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    // TypeORM derives junction table index names from a hash of the table and
    // column and offers no override, so these match what it expects. Renaming
    // them makes every future migration:generate want to rename them back.
    await queryRunner.query(`
      CREATE INDEX "IDX_2454ca172bd394ec6a5f17d8e4" ON "user_interests" ("userId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_de3affbc0f5f6bd38d35f3ea1b" ON "user_interests" ("interestId")
    `);

    // Ids match the client's features/auth/interests.ts so the app can post
    // exactly what it renders.
    await queryRunner.query(`
      INSERT INTO "interests" ("id", "label", "sortOrder") VALUES
        ('talent', 'Talent', 1),
        ('business', 'Business', 2),
        ('friendship', 'Friendship', 3),
        ('socials', 'Socials', 4),
        ('general', 'General', 5)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "user_interests"`);
    await queryRunner.query(`DROP TABLE "verification_codes"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE "auth_identities"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TABLE "interests"`);
    await queryRunner.query(`DROP TYPE "verification_codes_purpose_enum"`);
    await queryRunner.query(`DROP TYPE "auth_identities_provider_enum"`);
    await queryRunner.query(`DROP TYPE "users_status_enum"`);
    await queryRunner.query(`DROP TYPE "users_role_enum"`);
  }
}
