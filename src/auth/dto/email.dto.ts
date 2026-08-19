import { ApiProperty } from '@nestjs/swagger';

import { IsEmailAddress } from '../../common/decorators/validation.decorators';

/** Shared by every endpoint whose whole payload is an address. */
export class EmailDto {
	@ApiProperty({ example: 'ada@example.com', format: 'email' })
	@IsEmailAddress()
	email: string;
}
