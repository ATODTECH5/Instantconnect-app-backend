import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

import { TrimmedString } from '../../common/decorators/validation.decorators';
import { SendSupportMessageDto } from '../../support/dto/support-message.dto';

/** The agent name is not sent: it is the signed-in admin's own first name. */
export class MessageAdminUserDto extends SendSupportMessageDto {
	@ApiProperty({ example: 'Account review', maxLength: 120 })
	@IsString()
	@TrimmedString()
	@MinLength(1, { message: 'Add a subject' })
	@MaxLength(120)
	subject: string;
}
