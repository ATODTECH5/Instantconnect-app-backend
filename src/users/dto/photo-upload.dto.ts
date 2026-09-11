import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

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
