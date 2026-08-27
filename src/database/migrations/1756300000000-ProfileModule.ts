import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Turns the account into a profile.
 *
 * `interests` is renamed to `categories` because that is what it always held:
 * the five values the design calls Category. The many to many is collapsed to a
 * single column, since a user is here for one reason. Where an account had
 * picked several, the lowest sorted one is kept rather than dropped.
 *
 * Two ids are also corrected to the spelling the client and the design use
 * ('talent' to 'talents', 'socials' to 'social'), which the app was already
 * filtering on in features/home/categories.ts.
 *
 * Identifiers are quoted camelCase because the project keeps TypeORM's default
 * naming strategy, so raw SQL against these tables must quote them too.
 */
export class ProfileModule1756300000000 implements MigrationInterface {
	name = 'ProfileModule1756300000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "interests" RENAME TO "categories"`,
		);
		await queryRunner.query(
			`ALTER TABLE "categories" RENAME CONSTRAINT "PK_interests" TO "PK_categories"`,
		);

		await queryRunner.query(`
      UPDATE "categories" SET "id" = 'talents', "label" = 'Talents' WHERE "id" = 'talent'
    `);
		await queryRunner.query(`
      UPDATE "categories" SET "id" = 'social', "label" = 'Social' WHERE "id" = 'socials'
    `);

		await queryRunner.query(`
      CREATE TABLE "occupations" (
        "id" character varying(32) NOT NULL,
        "label" character varying(64) NOT NULL,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_occupations" PRIMARY KEY ("id")
      )
    `);

		await queryRunner.query(`
      CREATE TABLE "hobbies" (
        "id" character varying(32) NOT NULL,
        "label" character varying(64) NOT NULL,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_hobbies" PRIMARY KEY ("id")
      )
    `);

		await queryRunner.query(`
      CREATE TYPE "users_kycstatus_enum" AS ENUM ('none', 'pending', 'verified', 'rejected')
    `);

		await queryRunner.query(`
      ALTER TABLE "users"
        ADD "kycStatus" "users_kycstatus_enum" NOT NULL DEFAULT 'none',
        ADD "categoryId" character varying(32),
        ADD "username" character varying(30),
        ADD "bio" character varying(300),
        ADD "occupationId" character varying(32),
        ADD "locationLabel" character varying(120),
        ADD "latitude" double precision,
        ADD "longitude" double precision
    `);

		// Collapsing the many to many: keep the lowest sorted pick per account so
		// an existing user keeps a sensible category instead of losing it.
		await queryRunner.query(`
      UPDATE "users" SET "categoryId" = chosen."interestId"
      FROM (
        SELECT DISTINCT ON (ui."userId") ui."userId", ui."interestId"
        FROM "user_interests" ui
        JOIN "categories" c ON c."id" = ui."interestId"
        ORDER BY ui."userId", c."sortOrder"
      ) AS chosen
      WHERE "users"."id" = chosen."userId"
    `);

		await queryRunner.query(`DROP TABLE "user_interests"`);

		await queryRunner.query(`
      ALTER TABLE "users"
        ADD CONSTRAINT "FK_users_categoryId" FOREIGN KEY ("categoryId")
          REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE,
        ADD CONSTRAINT "FK_users_occupationId" FOREIGN KEY ("occupationId")
          REFERENCES "occupations"("id") ON DELETE SET NULL ON UPDATE CASCADE
    `);

		await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_users_username_active" ON "users" ("username")
      WHERE "deletedAt" IS NULL AND "username" IS NOT NULL
    `);

		await queryRunner.query(`
      CREATE TABLE "user_hobbies" (
        "userId" uuid NOT NULL,
        "hobbyId" character varying(32) NOT NULL,
        CONSTRAINT "PK_user_hobbies" PRIMARY KEY ("userId", "hobbyId"),
        CONSTRAINT "FK_user_hobbies_userId" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "FK_user_hobbies_hobbyId" FOREIGN KEY ("hobbyId")
          REFERENCES "hobbies"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
		await queryRunner.query(
			`CREATE INDEX "IDX_user_hobbies_userId" ON "user_hobbies" ("userId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_user_hobbies_hobbyId" ON "user_hobbies" ("hobbyId")`,
		);

		await queryRunner.query(`
      CREATE TABLE "user_photos" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "userId" uuid NOT NULL,
        "position" integer NOT NULL,
        "url" character varying(500) NOT NULL,
        "storageId" character varying(255) NOT NULL,
        CONSTRAINT "PK_user_photos" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_photos_user_position" UNIQUE ("userId", "position"),
        CONSTRAINT "CHK_user_photos_position" CHECK ("position" BETWEEN 0 AND 3),
        CONSTRAINT "FK_user_photos_userId" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
		await queryRunner.query(
			`CREATE INDEX "IDX_user_photos_userId" ON "user_photos" ("userId")`,
		);

		await queryRunner.query(`
      INSERT INTO "occupations" ("id", "label", "sortOrder") VALUES
        ('product-manager', 'Product Manager', 1),
        ('artist', 'Artist', 2),
        ('accountant', 'Accountant', 3),
        ('product-designer', 'Product Designer', 4),
        ('musician', 'Musician', 5),
        ('software-developer', 'Software Developer', 6),
        ('frontend-developer', 'Frontend Developer', 7),
        ('music-producer', 'Music Producer', 8),
        ('backend-developer', 'Backend Developer', 9),
        ('graphic-designer', 'Graphic Designer', 10),
        ('motion-designer', 'Motion Designer', 11),
        ('project-manager', 'Project Manager', 12)
    `);

		await queryRunner.query(`
      INSERT INTO "hobbies" ("id", "label", "sortOrder") VALUES
        ('music', 'Music', 1),
        ('art', 'Art', 2),
        ('travel', 'Travel', 3),
        ('photography', 'Photography', 4),
        ('reading', 'Reading', 5),
        ('dancing', 'Dancing', 6)
    `);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE "user_photos"`);
		await queryRunner.query(`DROP TABLE "user_hobbies"`);
		await queryRunner.query(`DROP TABLE "hobbies"`);

		await queryRunner.query(`
      CREATE TABLE "user_interests" (
        "userId" uuid NOT NULL,
        "interestId" character varying(32) NOT NULL,
        CONSTRAINT "PK_user_interests" PRIMARY KEY ("userId", "interestId"),
        CONSTRAINT "FK_user_interests_userId" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "FK_user_interests_interestId" FOREIGN KEY ("interestId")
          REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
		await queryRunner.query(`
      INSERT INTO "user_interests" ("userId", "interestId")
      SELECT "id", "categoryId" FROM "users" WHERE "categoryId" IS NOT NULL
    `);

		await queryRunner.query(`DROP INDEX "UQ_users_username_active"`);
		await queryRunner.query(`
      ALTER TABLE "users"
        DROP CONSTRAINT "FK_users_categoryId",
        DROP CONSTRAINT "FK_users_occupationId",
        DROP COLUMN "kycStatus",
        DROP COLUMN "categoryId",
        DROP COLUMN "username",
        DROP COLUMN "bio",
        DROP COLUMN "occupationId",
        DROP COLUMN "locationLabel",
        DROP COLUMN "latitude",
        DROP COLUMN "longitude"
    `);
		await queryRunner.query(`DROP TYPE "users_kycstatus_enum"`);
		await queryRunner.query(`DROP TABLE "occupations"`);

		await queryRunner.query(`
      UPDATE "categories" SET "id" = 'talent', "label" = 'Talent' WHERE "id" = 'talents'
    `);
		await queryRunner.query(`
      UPDATE "categories" SET "id" = 'socials', "label" = 'Socials' WHERE "id" = 'social'
    `);
		await queryRunner.query(
			`ALTER TABLE "categories" RENAME CONSTRAINT "PK_categories" TO "PK_interests"`,
		);
		await queryRunner.query(
			`ALTER TABLE "categories" RENAME TO "interests"`,
		);
	}
}
