/**
 * Abstract rather than an interface so it can double as the injection token.
 * Swapping providers means binding a different implementation in
 * {@link StorageModule}; nothing outside this directory changes.
 */
export abstract class Storage {
	/**
	 * The client uploads straight to the provider with this, so a photo never
	 * travels through the API. The id is chosen here rather than by the caller,
	 * which is what stops a signature being reused to overwrite another asset.
	 */
	abstract createUploadSignature(storageId: string): UploadSignature;

	/**
	 * Delivery URL for a stored asset. Never the original: an untouched phone
	 * photo is megabytes, and the same file is served on every card and row that
	 * shows the person.
	 */
	abstract buildUrl(storageId: string, variant: PhotoVariant): string;

	/** Null when nothing was ever uploaded against the id. */
	abstract findAsset(storageId: string): Promise<StoredAsset | null>;

	abstract delete(storageId: string): Promise<void>;

	abstract buildStorageId(userId: string, position: number): string;

	/**
	 * Chat images live under the conversation rather than the sender, so a
	 * thread's media can be swept in one go if it is ever deleted. The sender is
	 * still in the id, because that is what lets the confirm step reject an id
	 * signed for someone else.
	 */
	abstract buildChatStorageId(
		conversationId: string,
		senderId: string,
	): string;

	/**
	 * Whether an id is one {@link buildChatStorageId} would have produced for
	 * this pair. Lives here because the id format is this class's to know: a
	 * caller parsing the string itself would silently stop matching the day the
	 * layout changes.
	 */
	abstract isChatStorageId(
		storageId: string,
		conversationId: string,
		senderId: string,
	): boolean;
}

/**
 * `thumbnail` covers avatars and the edit screen's gallery squares; `full` is
 * the size a photo is opened at. Deliberately two rather than one per surface,
 * so a new screen reuses a cached derivative instead of minting another.
 */
export type PhotoVariant = 'thumbnail' | 'full';

export type UploadSignature = {
	uploadUrl: string;
	apiKey: string;
	timestamp: number;
	signature: string;
	storageId: string;
	/**
	 * Must be sent with the upload verbatim. It is part of what was signed, so
	 * changing it invalidates the signature, which is what caps the stored file.
	 */
	transformation: string;
};

export type StoredAsset = {
	storageId: string;
};
