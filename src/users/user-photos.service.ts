import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Storage, type UploadSignature } from '../storage/storage';
import {
	AVATAR_POSITION,
	MAX_PHOTO_POSITION,
	UserPhoto,
} from './entities/user-photo.entity';

@Injectable()
export class UserPhotosService {
	constructor(
		@InjectRepository(UserPhoto)
		private readonly photos: Repository<UserPhoto>,
		private readonly storage: Storage,
	) {}

	createUploadSignature(userId: string, position: number): UploadSignature {
		this.assertValidPosition(position);

		return this.storage.createUploadSignature(
			this.storage.buildStorageId(userId, position),
		);
	}

	/**
	 * Called once the client's direct upload finishes. The URL comes from the
	 * provider rather than the request body, so a caller cannot point a slot at
	 * an arbitrary address.
	 */
	async confirmUpload(
		userId: string,
		position: number,
		storageId: string,
	): Promise<UserPhoto> {
		this.assertValidPosition(position);
		this.assertOwnedStorageId(userId, position, storageId);

		const asset = await this.storage.findAsset(storageId);

		if (!asset) {
			throw new BadRequestException({
				code: 'UPLOAD_NOT_FOUND',
				message: 'That upload did not complete. Please try again.',
			});
		}

		const existing = await this.photos.findOne({
			where: { userId, position },
		});

		const saved = await this.photos.save(
			this.photos.create({
				id: existing?.id,
				userId,
				position,
				storageId,
			}),
		);

		if (existing && existing.storageId !== storageId) {
			await this.storage.delete(existing.storageId);
		}

		return saved;
	}

	async remove(userId: string, position: number): Promise<void> {
		this.assertValidPosition(position);

		const photo = await this.photos.findOne({
			where: { userId, position },
		});

		if (!photo) return;

		await this.photos.delete(photo.id);
		await this.storage.delete(photo.storageId);
	}

	private assertValidPosition(position: number): void {
		if (
			!Number.isInteger(position) ||
			position < AVATAR_POSITION ||
			position > MAX_PHOTO_POSITION
		) {
			throw new BadRequestException({
				code: 'INVALID_PHOTO_POSITION',
				message: `Position must be between ${AVATAR_POSITION} and ${MAX_PHOTO_POSITION}.`,
			});
		}
	}

	/**
	 * The signature already binds the upload to this id, but a caller could still
	 * confirm with an id signed for a different account, which would hand them
	 * someone else's photo.
	 */
	private assertOwnedStorageId(
		userId: string,
		position: number,
		storageId: string,
	): void {
		if (!storageId.includes(`/${userId}/${position}-`)) {
			throw new BadRequestException({
				code: 'INVALID_UPLOAD_REFERENCE',
				message: 'That upload does not belong to this photo slot.',
			});
		}
	}
}
