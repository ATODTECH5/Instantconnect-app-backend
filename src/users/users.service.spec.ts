import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { ReferenceService } from '../reference/reference.service';
import { Storage } from '../storage/storage';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

const USER_ID = '9f1c0d2e-0000-4000-8000-000000000001';

const existingUser = (overrides: Partial<User> = {}) =>
	({
		id: USER_ID,
		fullName: 'Halima Lawal',
		username: 'leemah',
		bio: 'Product person',
		categoryId: 'talents',
		occupationId: 'product-manager',
		locationLabel: 'Ikeja, Lagos',
		latitude: 6.6,
		longitude: 3.35,
		hobbies: [],
		photos: [],
		...overrides,
	}) as unknown as User;

describe('UsersService.updateProfile', () => {
	let service: UsersService;
	let users: Record<string, jest.Mock>;
	let reference: Record<string, jest.Mock>;
	let stored: User;

	beforeEach(async () => {
		stored = existingUser();

		users = {
			findOne: jest
				.fn()
				.mockImplementation(() => Promise.resolve(stored)),
			save: jest.fn((entity: User) => Promise.resolve(entity)),
			update: jest.fn().mockResolvedValue(undefined),
		};

		reference = {
			findCategoryOrFail: jest.fn().mockResolvedValue({ id: 'business' }),
			findOccupationOrFail: jest.fn().mockResolvedValue({ id: 'artist' }),
			resolveHobbies: jest
				.fn()
				.mockResolvedValue([{ id: 'music', label: 'Music' }]),
		};

		const moduleRef = await Test.createTestingModule({
			providers: [
				UsersService,
				{ provide: getRepositoryToken(User), useValue: users },
				{ provide: ReferenceService, useValue: reference },
				{
					provide: Storage,
					useValue: {
						buildUrl: jest.fn(
							(storageId: string, variant: string) =>
								`https://cdn/${variant}/${storageId}`,
						),
					},
				},
			],
		}).compile();

		service = moduleRef.get(UsersService);
	});

	const savedUser = (): User => {
		const [[saved]] = users.save.mock.calls as [User][];

		return saved;
	};

	it('leaves fields alone when the key is absent', async () => {
		await service.updateProfile(USER_ID, { fullName: 'Halima L' });

		const saved = savedUser();

		expect(saved.fullName).toBe('Halima L');
		expect(saved.bio).toBe('Product person');
		expect(saved.locationLabel).toBe('Ikeja, Lagos');
		expect(saved.occupationId).toBe('product-manager');
	});

	it('clears a field when the key is explicitly null', async () => {
		await service.updateProfile(USER_ID, {
			bio: null,
			occupationId: null,
			locationLabel: null,
		});

		const saved = savedUser();

		expect(saved.bio).toBeNull();
		expect(saved.occupationId).toBeNull();
		expect(saved.locationLabel).toBeNull();
	});

	it('does not look up an occupation it is only being asked to clear', async () => {
		await service.updateProfile(USER_ID, { occupationId: null });

		expect(reference.findOccupationOrFail).not.toHaveBeenCalled();
	});

	it('validates a category before assigning it', async () => {
		await service.updateProfile(USER_ID, { categoryId: 'business' });

		expect(reference.findCategoryOrFail).toHaveBeenCalledWith('business');
		expect(savedUser().categoryId).toBe('business');
	});

	it('replaces hobbies wholesale rather than appending', async () => {
		stored = existingUser({
			hobbies: [
				{ id: 'art', label: 'Art', sortOrder: 2, isActive: true },
			],
		});

		await service.updateProfile(USER_ID, { hobbyIds: ['music'] });

		expect(savedUser().hobbies).toEqual([{ id: 'music', label: 'Music' }]);
	});

	it('rejects a username another account already holds', async () => {
		users.findOne.mockImplementation(
			({ where }: { where: Record<string, unknown> }) =>
				Promise.resolve(
					'username' in where ? { id: 'someone-else' } : stored,
				),
		);

		await expect(
			service.updateProfile(USER_ID, { username: 'taken' }),
		).rejects.toThrow(ConflictException);
	});

	it('treats an empty username as clearing it', async () => {
		await service.updateProfile(USER_ID, { username: null });

		expect(savedUser().username).toBeNull();
	});
});

describe('UsersService.toProfile', () => {
	let service: UsersService;

	beforeEach(async () => {
		const moduleRef = await Test.createTestingModule({
			providers: [
				UsersService,
				{ provide: getRepositoryToken(User), useValue: {} },
				{ provide: ReferenceService, useValue: {} },
				{
					provide: Storage,
					useValue: {
						buildUrl: (storageId: string, variant: string) =>
							`https://cdn/${variant}/${storageId}`,
					},
				},
			],
		}).compile();

		service = moduleRef.get(UsersService);
	});

	const withPhotos = () =>
		existingUser({
			photos: [
				{ id: 'p0', position: 0, storageId: 'store/0-a' },
				{ id: 'p2', position: 2, storageId: 'store/2-c' },
				{ id: 'p1', position: 1, storageId: 'store/1-b' },
			],
		} as unknown as Partial<User>);

	it('serves the avatar at thumbnail size, never the original', () => {
		const profile = service.toProfile(withPhotos());

		expect(profile.avatarUrl).toBe('https://cdn/thumbnail/store/0-a');
	});

	it('keeps the avatar out of the gallery and orders the rest by slot', () => {
		const profile = service.toProfile(withPhotos());

		expect(profile.photos.map((photo) => photo.position)).toEqual([1, 2]);
	});

	it('offers each gallery photo at both sizes', () => {
		const [first] = service.toProfile(withPhotos()).photos;

		expect(first.thumbnailUrl).toBe('https://cdn/thumbnail/store/1-b');
		expect(first.url).toBe('https://cdn/full/store/1-b');
	});

	it('reports no avatar rather than failing when none was uploaded', () => {
		const profile = service.toProfile(existingUser({ photos: [] }));

		expect(profile.avatarUrl).toBeNull();
		expect(profile.photos).toEqual([]);
	});
});
