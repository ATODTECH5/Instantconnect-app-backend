import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { Storage } from '../storage/storage';
import { UserPhoto } from './entities/user-photo.entity';
import { UserPhotosService } from './user-photos.service';

const USER_ID = '9f1c0d2e-0000-4000-8000-000000000001';
const OTHER_USER_ID = '9f1c0d2e-0000-4000-8000-000000000002';
const storageIdFor = (userId: string, position: number) =>
	`instant-connect/profiles/${userId}/${position}-abcd`;

describe('UserPhotosService', () => {
	let service: UserPhotosService;
	let photos: Record<string, jest.Mock>;
	let storage: Record<string, jest.Mock>;

	beforeEach(async () => {
		photos = {
			findOne: jest.fn().mockResolvedValue(null),
			create: jest.fn((entity: Partial<UserPhoto>) => entity),
			save: jest.fn((entity: Partial<UserPhoto>) => entity),
			delete: jest.fn().mockResolvedValue(undefined),
		};

		storage = {
			buildStorageId: jest.fn((userId: string, position: number) =>
				storageIdFor(userId, position),
			),
			createUploadSignature: jest.fn((storageId: string) => ({
				uploadUrl: 'https://api.cloudinary.com/v1_1/demo/image/upload',
				apiKey: 'key',
				timestamp: 1,
				signature: 'sig',
				storageId,
				transformation: 'c_limit,w_1600,h_1600,q_auto:good',
			})),
			findAsset: jest.fn((storageId: string) =>
				Promise.resolve({ storageId }),
			),
			buildUrl: jest.fn(
				(storageId: string, variant: string) =>
					`https://cdn/${variant}/${storageId}`,
			),
			delete: jest.fn().mockResolvedValue(undefined),
		};

		const moduleRef = await Test.createTestingModule({
			providers: [
				UserPhotosService,
				{ provide: getRepositoryToken(UserPhoto), useValue: photos },
				{ provide: Storage, useValue: storage },
			],
		}).compile();

		service = moduleRef.get(UserPhotosService);
	});

	describe('position validation', () => {
		it.each([-1, 4, 1.5])('rejects position %p', (position) => {
			expect(() =>
				service.createUploadSignature(USER_ID, position),
			).toThrow(BadRequestException);
		});

		it.each([0, 1, 2, 3])('accepts position %p', (position) => {
			expect(
				service.createUploadSignature(USER_ID, position).storageId,
			).toContain(`/${position}-`);
		});
	});

	describe('confirmUpload', () => {
		it('refuses a storage id signed for another account', async () => {
			await expect(
				service.confirmUpload(
					USER_ID,
					1,
					storageIdFor(OTHER_USER_ID, 1),
				),
			).rejects.toThrow(BadRequestException);

			expect(photos.save).not.toHaveBeenCalled();
		});

		it('refuses a storage id belonging to a different slot', async () => {
			await expect(
				service.confirmUpload(USER_ID, 1, storageIdFor(USER_ID, 2)),
			).rejects.toThrow(BadRequestException);
		});

		it('stores only the provider handle, never a caller supplied address', async () => {
			const saved = await service.confirmUpload(
				USER_ID,
				1,
				storageIdFor(USER_ID, 1),
			);

			expect(saved.storageId).toBe(storageIdFor(USER_ID, 1));
			expect(saved).not.toHaveProperty('url');
		});

		it('rejects a confirmation for an upload that never landed', async () => {
			storage.findAsset.mockResolvedValue(null);

			await expect(
				service.confirmUpload(USER_ID, 1, storageIdFor(USER_ID, 1)),
			).rejects.toThrow(BadRequestException);
		});

		it('deletes the file the slot used to hold', async () => {
			const previous = storageIdFor(USER_ID, 1).replace('abcd', 'old');
			photos.findOne.mockResolvedValue({
				id: 'photo-1',
				storageId: previous,
			});

			await service.confirmUpload(USER_ID, 1, storageIdFor(USER_ID, 1));

			expect(storage.delete).toHaveBeenCalledWith(previous);
		});

		it('reuses the existing row so a slot cannot end up with two photos', async () => {
			photos.findOne.mockResolvedValue({
				id: 'photo-1',
				storageId: storageIdFor(USER_ID, 1),
			});

			await service.confirmUpload(USER_ID, 1, storageIdFor(USER_ID, 1));

			expect(photos.create).toHaveBeenCalledWith(
				expect.objectContaining({ id: 'photo-1' }),
			);
		});
	});

	describe('remove', () => {
		it('deletes the stored file alongside the row', async () => {
			photos.findOne.mockResolvedValue({
				id: 'photo-1',
				storageId: storageIdFor(USER_ID, 2),
			});

			await service.remove(USER_ID, 2);

			expect(photos.delete).toHaveBeenCalledWith('photo-1');
			expect(storage.delete).toHaveBeenCalledWith(
				storageIdFor(USER_ID, 2),
			);
		});

		it('is a no-op for an empty slot', async () => {
			await service.remove(USER_ID, 2);

			expect(photos.delete).not.toHaveBeenCalled();
			expect(storage.delete).not.toHaveBeenCalled();
		});
	});
});
