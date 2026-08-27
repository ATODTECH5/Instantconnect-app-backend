import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

import type { UploadSignature } from '../../storage/storage';

export class ConfirmPhotoUploadDto {
	@ApiProperty({
		description:
			'The storageId handed back by the signature call, after the upload to the provider succeeded.',
		example: 'instant-connect/profiles/9f1c.../1-2b7d...',
	})
	@IsString()
	@MaxLength(255)
	storageId: string;
}

export class UploadSignatureResponseDto {
	@ApiProperty({
		example: 'https://api.cloudinary.com/v1_1/demo/image/upload',
	})
	uploadUrl: string;

	@ApiProperty({ example: '813674531274852' })
	apiKey: string;

	@ApiProperty({ example: 1756282800 })
	timestamp: number;

	@ApiProperty({ example: 'a1b2c3d4e5f6' })
	signature: string;

	@ApiProperty({
		description:
			'Send this as public_id in the upload, then back to confirm the slot.',
		example: 'instant-connect/profiles/9f1c.../1-2b7d...',
	})
	storageId: string;

	@ApiProperty({
		description:
			'Send verbatim as the transformation field. It caps the stored file and is part of what was signed, so altering it fails the upload.',
		example: 'c_limit,w_1600,h_1600,q_auto:good',
	})
	transformation: string;

	constructor(signature: UploadSignature) {
		this.uploadUrl = signature.uploadUrl;
		this.apiKey = signature.apiKey;
		this.timestamp = signature.timestamp;
		this.signature = signature.signature;
		this.storageId = signature.storageId;
		this.transformation = signature.transformation;
	}
}
