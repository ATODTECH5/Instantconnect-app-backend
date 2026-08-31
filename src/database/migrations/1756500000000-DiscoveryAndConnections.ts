import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Makes the discovery feed answerable and gives Connect somewhere to write.
 *
 * `location` is generated rather than maintained by the app so it can never
 * drift from the latitude and longitude the profile screen already writes.
 * PostGIS is the dependency this buys: a radius filter and a distance sort over
 * a bounding box of hand rolled trigonometry is neither indexable nor correct
 * near the poles or the antimeridian.
 *
 * `dateOfBirth` is nullable because accounts already exist without one and
 * there is no honest value to backfill. New registrations are required to send
 * it by RegisterDto, and discovery omits an age it does not know rather than
 * guessing.
 *
 * One connection row represents a pair in either direction, which is what
 * UQ_connections_pair enforces: without it, A requesting B and B requesting A
 * would create two rows describing one relationship.
 *
 * Identifiers are quoted camelCase because the project keeps TypeORM's default
 * naming strategy.
 */
export class DiscoveryAndConnections1756500000000 implements MigrationInterface {
	name = 'DiscoveryAndConnections1756500000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis`);

		await queryRunner.query(
			`ALTER TABLE "users" ADD COLUMN "dateOfBirth" date`,
		);

		await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN "location" geography(Point, 4326)
        GENERATED ALWAYS AS (
          ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography
        ) STORED
    `);

		await queryRunner.query(`
      CREATE INDEX "IDX_users_location" ON "users" USING GIST ("location")
        WHERE "deletedAt" IS NULL
    `);

		await queryRunner.query(`
      CREATE INDEX "IDX_users_categoryId" ON "users" ("categoryId")
        WHERE "deletedAt" IS NULL
    `);

		await queryRunner.query(`
      CREATE TYPE "connections_status_enum"
        AS ENUM ('pending', 'accepted', 'declined')
    `);

		await queryRunner.query(`
      CREATE TABLE "connections" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "requesterId" uuid NOT NULL,
        "addresseeId" uuid NOT NULL,
        "status" "connections_status_enum" NOT NULL DEFAULT 'pending',
        "respondedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_connections" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_connections_not_self"
          CHECK ("requesterId" <> "addresseeId"),
        CONSTRAINT "FK_connections_requesterId"
          FOREIGN KEY ("requesterId") REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_connections_addresseeId"
          FOREIGN KEY ("addresseeId") REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);

		await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_connections_pair" ON "connections" (
        LEAST("requesterId", "addresseeId"),
        GREATEST("requesterId", "addresseeId")
      )
    `);

		await queryRunner.query(`
      CREATE INDEX "IDX_connections_addressee_status"
        ON "connections" ("addresseeId", "status")
    `);

		await queryRunner.query(`
      CREATE INDEX "IDX_connections_requester_status"
        ON "connections" ("requesterId", "status")
    `);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE "connections"`);
		await queryRunner.query(`DROP TYPE "connections_status_enum"`);

		await queryRunner.query(`DROP INDEX "IDX_users_categoryId"`);
		await queryRunner.query(`DROP INDEX "IDX_users_location"`);
		await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "location", DROP COLUMN "dateOfBirth"
    `);
	}
}
