import { randomUUID } from 'node:crypto';

import { Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

import type { storageConfig } from '../config/configuration';
import {
	Storage,
	type PhotoVariant,
	type StoredAsset,
	type UploadSignature,
} from './storage';

/**
 * Applied before the file is stored, so a 12 megapixel phone photo never lands
 * in the account at full size. Signed with the request, so a client cannot drop
 * it to upload the original instead.
 */
const INCOMING_TRANSFORMATION = 'c_limit,w_1600,h_1600,q_auto:good';

/**
 * `f_auto` negotiates WebP or AVIF per client and `q_auto` picks quality per
 * image; together they are most of the bandwidth saving. `g_face` keeps the
 * subject centred when a portrait is cropped square.
 */
const VARIANTS: Record<PhotoVariant, string> = {
	thumbnail: 'f_auto,q_auto,w_256,h_256,c_fill,g_face',
	full: 'f_auto,q_auto,w_900,c_limit',
};

export class CloudinaryStorage extends Storage {
	private readonly logger = new Logger(CloudinaryStorage.name);

	constructor(private readonly config: ConfigType<typeof storageConfig>) {
		super();

		cloudinary.config({
			cloud_name: config.cloudName,
			api_key: config.apiKey,
			api_secret: config.apiSecret,
			secure: true,
		});
	}

	/**
	 * The random suffix matters: reusing a deterministic id would let a cached
	 * CDN copy of the previous photo answer for the new one.
	 */
	buildStorageId(userId: string, position: number): string {
		return `${this.config.uploadFolder}/${userId}/${position}-${randomUUID()}`;
	}

	buildChatStorageId(conversationId: string, senderId: string): string {
		return `${this.config.chatFolder}/${conversationId}/${senderId}-${randomUUID()}`;
	}

	isChatStorageId(
		storageId: string,
		conversationId: string,
		senderId: string,
	): boolean {
		return storageId.startsWith(
			`${this.config.chatFolder}/${conversationId}/${senderId}-`,
		);
	}

	createUploadSignature(storageId: string): UploadSignature {
		const timestamp = Math.floor(Date.now() / 1000);
		const signature = cloudinary.utils.api_sign_request(
			{
				public_id: storageId,
				timestamp,
				transformation: INCOMING_TRANSFORMATION,
			},
			this.config.apiSecret as string,
		);

		return {
			uploadUrl: `https://api.cloudinary.com/v1_1/${this.config.cloudName}/image/upload`,
			apiKey: this.config.apiKey as string,
			timestamp,
			signature,
			storageId,
			transformation: INCOMING_TRANSFORMATION,
		};
	}

	buildUrl(storageId: string, variant: PhotoVariant): string {
		return `https://res.cloudinary.com/${this.config.cloudName}/image/upload/${VARIANTS[variant]}/${storageId}`;
	}

	async findAsset(storageId: string): Promise<StoredAsset | null> {
		try {
			await cloudinary.api.resource(storageId, {
				resource_type: 'image',
			});

			return { storageId };
		} catch (error) {
			if (isNotFound(error)) return null;

			throw error;
		}
	}

	/**
	 * Best effort. A row pointing at a missing file is recoverable, but refusing
	 * to remove the photo because the provider is briefly unreachable is not.
	 */
	async delete(storageId: string): Promise<void> {
		try {
			await cloudinary.uploader.destroy(storageId, {
				resource_type: 'image',
				invalidate: true,
			});
		} catch (error) {
			this.logger.warn(
				`Could not delete stored photo ${storageId}; the row was removed anyway: ${String(error)}`,
			);
		}
	}
}

/**
 * The SDK reports a missing resource two ways depending on the call: some
 * reject with `{ http_code }` at the top level, `api.resource` with it nested
 * under `error`. Reading only the top level made every missing asset look like
 * an outage, so `UPLOAD_NOT_FOUND` was unreachable and callers saw a 500.
 */
function isNotFound(error: unknown): boolean {
	return httpCodeOf(error) === 404 || httpCodeOf(unwrap(error)) === 404;
}

function unwrap(error: unknown): unknown {
	return typeof error === 'object' && error !== null && 'error' in error
		? error.error
		: undefined;
}

function httpCodeOf(error: unknown): number | undefined {
	if (typeof error !== 'object' || error === null) return undefined;
	if (!('http_code' in error)) return undefined;

	const code = error.http_code;

	return typeof code === 'number' ? code : undefined;
}
