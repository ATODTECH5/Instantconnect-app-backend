import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateConnectionDto {
	@ApiProperty({ format: 'uuid', description: 'Who the request is sent to.' })
	@IsUUID()
	addresseeId: string;
}
