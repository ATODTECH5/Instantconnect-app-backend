import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';

/** Long enough for a real paragraph, short enough that one row cannot be abused. */
export const MAX_MESSAGE_LENGTH = 4000;

/** Matches the `varchar(255)` the column is declared as. */
export const MAX_STORAGE_ID_LENGTH = 255;

/**
 * A message is text or an image, never both. Sending neither fails validation
 * here; sending both is rejected by the service, because `ValidateIf` can
 * express "required unless the other is present" but not "not both".
 */
export class SendMessageDto {
	@ApiPropertyOptional({
		maxLength: MAX_MESSAGE_LENGTH,
		example: 'Hello, how are you?',
		description: 'Required unless mediaStorageId is given.',
	})
	@ValidateIf((dto: SendMessageDto) => dto.mediaStorageId === undefined)
	@Transform(({ value }: { value: unknown }) =>
		typeof value === 'string' ? value.trim() : value,
	)
	@IsString()
	@IsNotEmpty()
	@MaxLength(MAX_MESSAGE_LENGTH)
	body?: string;

	@ApiPropertyOptional({
		maxLength: MAX_STORAGE_ID_LENGTH,
		description:
			'A finished upload from POST /conversations/:id/messages/upload-signature. The server confirms it exists with the provider before storing it.',
	})
	@ValidateIf((dto: SendMessageDto) => dto.body === undefined)
	@IsString()
	@IsNotEmpty()
	@MaxLength(MAX_STORAGE_ID_LENGTH)
	mediaStorageId?: string;
}
