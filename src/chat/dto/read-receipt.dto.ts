import { ApiProperty } from '@nestjs/swagger';

export class ReadReceiptDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ description: 'Everything before this now counts as read.' })
	lastReadAt: Date;

	constructor(id: string, lastReadAt: Date) {
		this.id = id;
		this.lastReadAt = lastReadAt;
	}
}
