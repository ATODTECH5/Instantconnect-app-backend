import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { normaliseEmail } from '../common/utils/normalise.util';
import { InterestsService } from '../interests/interests.service';
import { UpdateSecurityDto } from './dto/update-security.dto';
import { User } from './entities/user.entity';
import { UserStatus } from './entities/user-status.enum';

export type CreateUserData = {
	fullName: string;
	email: string;
	phone: string;
	passwordHash: string;
};

@Injectable()
export class UsersService {
	constructor(
		@InjectRepository(User)
		private readonly users: Repository<User>,
		private readonly interests: InterestsService,
	) {}

	findById(id: string): Promise<User | null> {
		return this.users.findOne({
			where: { id },
			relations: { interests: true },
		});
	}

	findByEmail(email: string): Promise<User | null> {
		return this.users.findOne({ where: { email: normaliseEmail(email) } });
	}

	findByPhone(phone: string): Promise<User | null> {
		return this.users.findOne({ where: { phone } });
	}

	/** `passwordHash` carries `select: false`, so authentication has to ask for it by name. */
	findByEmailForAuthentication(email: string): Promise<User | null> {
		return this.users.findOne({
			where: { email: normaliseEmail(email) },
			select: {
				id: true,
				email: true,
				fullName: true,
				passwordHash: true,
				role: true,
				status: true,
				emailVerifiedAt: true,
			},
		});
	}

	async create(data: CreateUserData): Promise<User> {
		const user = this.users.create({
			fullName: data.fullName,
			email: normaliseEmail(data.email),
			phone: data.phone,
			passwordHash: data.passwordHash,
			termsAcceptedAt: new Date(),
			status: UserStatus.PendingVerification,
		});

		return this.users.save(user);
	}

	async markEmailVerified(userId: string): Promise<void> {
		await this.users.update(userId, {
			emailVerifiedAt: new Date(),
			status: UserStatus.Active,
		});
	}

	async setPasswordHash(userId: string, passwordHash: string): Promise<void> {
		await this.users.update(userId, { passwordHash });
	}

	async recordSignIn(userId: string): Promise<void> {
		await this.users.update(userId, { lastSignedInAt: new Date() });
	}

	async updateSecurity(
		userId: string,
		changes: UpdateSecurityDto,
	): Promise<User> {
		await this.users.update(userId, changes);

		return this.getByIdOrFail(userId);
	}

	async replaceInterests(
		userId: string,
		interestIds: string[],
	): Promise<User> {
		const user = await this.getByIdOrFail(userId);

		user.interests = await this.interests.resolveActive(interestIds);

		return this.users.save(user);
	}

	async getByIdOrFail(id: string): Promise<User> {
		const user = await this.findById(id);

		if (!user) {
			throw new NotFoundException({
				code: 'USER_NOT_FOUND',
				message: 'That account no longer exists.',
			});
		}

		return user;
	}
}
