import {
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';

import { normaliseEmail } from '../common/utils/normalise.util';
import { ReferenceService } from '../reference/reference.service';
import { Storage } from '../storage/storage';
import {
	ProfilePhotoDto,
	ProfileResponseDto,
	ProfileStatsDto,
} from './dto/profile-response.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateSecurityDto } from './dto/update-security.dto';
import { User } from './entities/user.entity';
import { UserStatus } from './entities/user-status.enum';

export type CreateUserData = {
	fullName: string;
	email: string;
	phone: string;
	passwordHash: string;
};

const PROFILE_RELATIONS = {
	category: true,
	occupation: true,
	hobbies: true,
	photos: true,
} as const;

@Injectable()
export class UsersService {
	constructor(
		@InjectRepository(User)
		private readonly users: Repository<User>,
		private readonly reference: ReferenceService,
		private readonly storage: Storage,
	) {}

	findById(id: string): Promise<User | null> {
		return this.users.findOne({
			where: { id },
			relations: PROFILE_RELATIONS,
		});
	}

	/**
	 * Runs on every token rotation, so it skips the profile relations that
	 * {@link findById} joins. The payload only carries id, email and role.
	 */
	findByIdForTokens(id: string): Promise<User | null> {
		return this.users.findOne({
			where: { id },
			select: { id: true, email: true, role: true },
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

	async setCategory(userId: string, categoryId: string): Promise<User> {
		await this.reference.findCategoryOrFail(categoryId);
		await this.users.update(userId, { categoryId });

		return this.getByIdOrFail(userId);
	}

	/**
	 * Absent keys are left alone and explicit nulls clear the field, so the edit
	 * screen can send only what the user actually touched.
	 */
	async updateProfile(
		userId: string,
		changes: UpdateProfileDto,
	): Promise<User> {
		const user = await this.getByIdOrFail(userId);

		if (changes.categoryId !== undefined) {
			await this.reference.findCategoryOrFail(changes.categoryId);
			user.categoryId = changes.categoryId;
		}

		if (changes.occupationId !== undefined) {
			if (changes.occupationId !== null) {
				await this.reference.findOccupationOrFail(changes.occupationId);
			}

			user.occupationId = changes.occupationId;
		}

		if (changes.username !== undefined) {
			user.username = changes.username
				? await this.claimUsername(userId, changes.username)
				: null;
		}

		if (changes.hobbyIds !== undefined) {
			user.hobbies = await this.reference.resolveHobbies(
				changes.hobbyIds,
			);
		}

		if (changes.fullName !== undefined) user.fullName = changes.fullName;
		if (changes.bio !== undefined) user.bio = changes.bio || null;
		if (changes.locationLabel !== undefined) {
			user.locationLabel = changes.locationLabel || null;
		}
		if (changes.latitude !== undefined) user.latitude = changes.latitude;
		if (changes.longitude !== undefined) user.longitude = changes.longitude;

		await this.users.save(user);

		return this.getByIdOrFail(userId);
	}

	async getProfile(userId: string): Promise<ProfileResponseDto> {
		return this.toProfile(await this.getByIdOrFail(userId));
	}

	toProfile(user: User): ProfileResponseDto {
		const photos: ProfilePhotoDto[] = (user.photos ?? []).map((photo) => ({
			id: photo.id,
			position: photo.position,
			thumbnailUrl: this.storage.buildUrl(photo.storageId, 'thumbnail'),
			url: this.storage.buildUrl(photo.storageId, 'full'),
		}));

		return new ProfileResponseDto(user, this.buildStats(), photos);
	}

	/**
	 * Counts the profile header renders. Connections, events and communities are
	 * not modelled yet, so they read zero rather than being invented client side.
	 */
	private buildStats(): ProfileStatsDto {
		return { connections: 0, eventsJoined: 0, communities: 0 };
	}

	/**
	 * Checked rather than left to the unique index so the client gets
	 * USERNAME_TAKEN instead of the filter's generic conflict. The index is still
	 * what makes it safe under a race.
	 */
	private async claimUsername(
		userId: string,
		username: string,
	): Promise<string> {
		const taken = await this.users.findOne({
			where: { username, id: Not(userId) },
			select: { id: true },
		});

		if (taken) {
			throw new ConflictException({
				code: 'USERNAME_TAKEN',
				message: 'That username is already taken.',
			});
		}

		return username;
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
