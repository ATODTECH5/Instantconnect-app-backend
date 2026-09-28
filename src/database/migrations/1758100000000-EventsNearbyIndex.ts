import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `GET /events/nearby` filters on ST_DWithin over the venue, the same way
 * discovery filters people, so the venue gets the GiST index that makes that
 * an index scan rather than a distance computed for every event.
 */
export class EventsNearbyIndex1758100000000 implements MigrationInterface {
	name = 'EventsNearbyIndex1758100000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE INDEX "IDX_events_venueLocation" ON "events" USING GiST ("venueLocation")`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX "IDX_events_venueLocation"`);
	}
}
