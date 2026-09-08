import type { DataSource } from 'typeorm';

import { hashSecret } from '../../common/utils/hashing.util';
import { Hobby } from '../../reference/entities/hobby.entity';
import { KycStatus } from '../../users/entities/kyc-status.enum';
import { User } from '../../users/entities/user.entity';
import { UserStatus } from '../../users/entities/user-status.enum';
import dataSource from '../data-source';
import { seedConversations } from './dev-conversations';
import { DEV_PASSWORD, SEED_EMAIL_DOMAIN, buildSeedPeople } from './dev-people';

/**
 * Fills an empty database with people to discover. Discovery is unusable before
 * this: a fresh database has only the accounts you registered by hand, none of
 * which have coordinates, so the feed returns nothing and neither the radius
 * filter nor the distance sort can be exercised at all.
 *
 * Re-running replaces the fixture rather than adding to it. Rows are recognised
 * by the reserved email domain, so nothing a human created is ever touched.
 */
async function assertSchemaIsMigrated(source: DataSource): Promise<void> {
	const [{ ready }] = await source.query<{ ready: boolean }[]>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'dateOfBirth'
    ) AS ready
  `);

	if (!ready) {
		throw new Error(
			'The DiscoveryAndConnections migration has not been applied. Run `npm run migration:run` first.',
		);
	}
}

async function clearPreviousSeed(source: DataSource): Promise<number> {
	const result = await source
		.createQueryBuilder()
		.delete()
		.from(User)
		.where('email LIKE :pattern', { pattern: `%@${SEED_EMAIL_DOMAIN}` })
		.execute();

	return result.affected ?? 0;
}

async function seed(source: DataSource): Promise<void> {
	const people = buildSeedPeople();
	const hobbies = await source.getRepository(Hobby).find();
	const hobbyById = new Map(hobbies.map((hobby) => [hobby.id, hobby]));

	/**
	 * One hash reused across the fixture. argon2 is deliberately slow, and
	 * hashing the same password forty times would add seconds for no benefit
	 * that matters to a fixture.
	 */
	const passwordHash = await hashSecret(DEV_PASSWORD);
	const now = new Date();

	const users = source.getRepository(User);

	const saved = await users.save(
		people.map((person) =>
			users.create({
				fullName: person.fullName,
				email: person.email,
				phone: person.phone,
				username: person.username,
				bio: person.bio,
				dateOfBirth: person.dateOfBirth,
				passwordHash,
				status: UserStatus.Active,
				emailVerifiedAt: now,
				termsAcceptedAt: now,
				categoryId: person.categoryId,
				occupationId: person.occupationId,
				locationLabel: person.locationLabel,
				latitude: person.latitude,
				longitude: person.longitude,
				kycStatus: person.kycStatus,
				hobbies: person.hobbyIds
					.map((id) => hobbyById.get(id))
					.filter((hobby): hobby is Hobby => hobby !== undefined),
			}),
		),
	);

	const verified = people.filter(
		(person) => person.kycStatus === KycStatus.Verified,
	).length;

	console.log(`Seeded ${people.length} people (${verified} KYC verified).`);
	console.log(`Sign in as any of them with ${DEV_PASSWORD}.`);
	console.log(`First account: ${people[0].email}`);

	const chats = await seedConversations(source, saved);

	if (chats.threads === 0) {
		console.log(
			'No conversations seeded: register an account by hand first, then re-run.',
		);
	} else {
		console.log(
			`Opened ${chats.threads} threads across ${chats.humans} account(s) you registered.`,
		);
	}
}

async function run(): Promise<void> {
	if (process.env.NODE_ENV === 'production') {
		throw new Error('Refusing to seed fixtures into production.');
	}

	const source = await dataSource.initialize();

	try {
		await assertSchemaIsMigrated(source);

		const removed = await clearPreviousSeed(source);

		if (removed > 0) {
			console.log(`Removed ${removed} rows from a previous seed.`);
		}

		await seed(source);
	} finally {
		await source.destroy();
	}
}

run().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
