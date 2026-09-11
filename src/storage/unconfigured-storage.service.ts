import { ServiceUnavailableException } from '@nestjs/common';

import { Storage, type StoredAsset, type UploadSignature } from './storage';

/**
 * Bound when no provider credentials are set, so a developer without a
 * Cloudinary account still gets a working boot and every other profile endpoint.
 * Only the photo routes fail, and they say why.
 */
export class UnconfiguredStorage extends Storage {
	buildStorageId(): string {
		throw this.notConfigured();
	}

	buildChatStorageId(): string {
		throw this.notConfigured();
	}

	isChatStorageId(): boolean {
		throw this.notConfigured();
	}

	createUploadSignature(): UploadSignature {
		throw this.notConfigured();
	}

	/**
	 * Reachable only for rows uploaded before the credentials were removed, so it
	 * returns a dead URL rather than failing the whole profile read.
	 */
	buildUrl(storageId: string): string {
		return storageId;
	}

	findAsset(): Promise<StoredAsset | null> {
		throw this.notConfigured();
	}

	delete(): Promise<void> {
		throw this.notConfigured();
	}

	private notConfigured(): ServiceUnavailableException {
		return new ServiceUnavailableException({
			code: 'STORAGE_NOT_CONFIGURED',
			message:
				'Image uploads are unavailable because no storage provider is configured.',
		});
	}
}
