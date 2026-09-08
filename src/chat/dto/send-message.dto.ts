import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

/** Long enough for a real paragraph, short enough that one row cannot be abused. */
export const MAX_MESSAGE_LENGTH = 4000;

export class SendMessageDto {
	@ApiProperty({
		maxLength: MAX_MESSAGE_LENGTH,
		example: 'Hello, how are you?',
	})
	@Transform(({ value }: { value: unknown }) =>
		typeof value === 'string' ? value.trim() : value,
	)
	@IsString()
	@IsNotEmpty()
	@MaxLength(MAX_MESSAGE_LENGTH)
	body!: string;
}
