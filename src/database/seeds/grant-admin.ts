import { normaliseEmail } from '../../common/utils/normalise.util';
import { User } from '../../users/entities/user.entity';
import { UserRole } from '../../users/entities/user-role.enum';
import dataSource from '../data-source';

/**
 * Admins are ordinary accounts with a different role, so there is no admin
 * sign up. Register through the app, verify the email, then promote it here.
 * The role reaches the token on the next sign in or refresh.
 */
async function run(): Promise<void> {
	const email = process.argv[2];

	if (!email) {
		throw new Error('Usage: npm run admin:grant -- <email>');
	}

	const source = await dataSource.initialize();

	try {
		const users = source.getRepository(User);
		const user = await users.findOne({
			where: { email: normaliseEmail(email) },
			select: {
				id: true,
				email: true,
				role: true,
				emailVerifiedAt: true,
			},
		});

		if (!user) throw new Error(`No account uses ${email}.`);

		if (!user.emailVerifiedAt) {
			throw new Error(`${user.email} has not verified its email yet.`);
		}

		if (user.role === UserRole.Admin) {
			console.log(`${user.email} is already an admin.`);
			return;
		}

		await users.update(user.id, { role: UserRole.Admin });
		console.log(`${user.email} is now an admin.`);
	} finally {
		await source.destroy();
	}
}

run().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
