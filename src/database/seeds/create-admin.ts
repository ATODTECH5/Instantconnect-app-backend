import { IsNull } from 'typeorm';

import { unmetRequirements } from '../../auth/dto/strong-password.decorator';
import { hashSecret } from '../../common/utils/hashing.util';
import {
	normaliseEmail,
	toE164Nigerian,
} from '../../common/utils/normalise.util';
import { User } from '../../users/entities/user.entity';
import { UserRole } from '../../users/entities/user-role.enum';
import { UserStatus } from '../../users/entities/user-status.enum';
import dataSource from '../data-source';

const USAGE =
	'Usage: ADMIN_PASSWORD=... npm run admin:create -- <email> "<full name>" <phone>';

/**
 * Creates a dashboard-only account, already verified, for an address that
 * should never be a member as well. `admin:grant` promotes an existing member
 * instead; this is for keeping the two roles on separate logins.
 *
 * The password comes from the environment rather than the arguments, so it
 * stays out of shell history and the process list.
 */
async function run(): Promise<void> {
	const [rawEmail, fullName, rawPhone] = process.argv.slice(2);
	const password = process.env.ADMIN_PASSWORD;

	if (!rawEmail || !fullName || !rawPhone || !password) {
		throw new Error(USAGE);
	}

	const missing = unmetRequirements(password);

	if (missing.length > 0) {
		throw new Error(`ADMIN_PASSWORD needs ${missing.join(', ')}.`);
	}

	const email = normaliseEmail(rawEmail);
	const phone = toE164Nigerian(rawPhone);
	const source = await dataSource.initialize();

	try {
		const users = source.getRepository(User);

		if (await users.exists({ where: { email, deletedAt: IsNull() } })) {
			throw new Error(
				`${email} already has an account. Use admin:grant to promote it.`,
			);
		}

		if (await users.exists({ where: { phone, deletedAt: IsNull() } })) {
			throw new Error(
				`${phone} is already used by another account. Pick another number.`,
			);
		}

		const now = new Date();

		await users.save(
			users.create({
				fullName: fullName.trim(),
				email,
				phone,
				passwordHash: await hashSecret(password),
				role: UserRole.Admin,
				status: UserStatus.Active,
				emailVerifiedAt: now,
				termsAcceptedAt: now,
			}),
		);

		console.log(`${email} is now an admin. Sign in on the dashboard.`);
	} finally {
		await source.destroy();
	}
}

run().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
