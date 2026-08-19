import { ApiProperty } from '@nestjs/swagger';

import type { Interest } from '../entities/interest.entity';

export class InterestResponseDto {
	@ApiProperty({ example: 'talent' })
	id: string;

	@ApiProperty({ example: 'Talent' })
	label: string;

	constructor(interest: Interest) {
		this.id = interest.id;
		this.label = interest.label;
	}

	static fromMany(interests: Interest[]): InterestResponseDto[] {
		return interests.map((interest) => new InterestResponseDto(interest));
	}
}
