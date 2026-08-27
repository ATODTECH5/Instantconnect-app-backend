import { ApiProperty } from '@nestjs/swagger';

import type { LookupEntity } from '../entities/lookup.entity';

export class LookupResponseDto {
	@ApiProperty({ example: 'product-manager' })
	id: string;

	@ApiProperty({ example: 'Product Manager' })
	label: string;

	constructor(entry: LookupEntity) {
		this.id = entry.id;
		this.label = entry.label;
	}

	static fromMany(entries: LookupEntity[]): LookupResponseDto[] {
		return entries.map((entry) => new LookupResponseDto(entry));
	}
}
