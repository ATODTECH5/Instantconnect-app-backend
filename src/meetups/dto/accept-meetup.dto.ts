import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601 } from 'class-validator';

export class AcceptMeetupDto {
	@ApiProperty({
		example: '2026-09-20T15:00:00.000Z',
		description:
			'Must be one of the proposed times, and still in the future.',
	})
	@IsISO8601({ strict: true })
	scheduledAt!: string;
}
