import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PageInfoDto } from '../../common/dto/pagination.dto';
import type { ConnectionState } from '../../connections/connection-state';
import { LookupResponseDto } from '../../reference/dto/lookup-response.dto';
import { KycStatus } from '../../users/entities/kyc-status.enum';
import type { User } from '../../users/entities/user.entity';
import { ageOn } from '../../common/utils/age.util';
import { isOnline } from '../../presence/online-window';

export class NearbyPersonDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ example: 'Iyan Filani' })
	fullName: string;

	@ApiPropertyOptional({
		description:
			'Null for accounts created before date of birth was captured.',
		example: 27,
		nullable: true,
	})
	age: number | null;

	@ApiPropertyOptional({ type: LookupResponseDto, nullable: true })
	category: LookupResponseDto | null;

	@ApiPropertyOptional({ type: LookupResponseDto, nullable: true })
	occupation: LookupResponseDto | null;

	@ApiPropertyOptional({ nullable: true })
	avatarUrl: string | null;

	@ApiProperty({
		description: 'Great circle distance from the viewer, in kilometres.',
		example: 1.8,
	})
	distanceKm: number;

	@ApiProperty({ example: false })
	isVerified: boolean;

	@ApiProperty({
		description:
			'Seen within the online window. Drives the dot on the card.',
		example: false,
	})
	isOnline: boolean;

	@ApiProperty({
		enum: [
			'none',
			'outgoing_pending',
			'incoming_pending',
			'connected',
			'declined',
		],
		description:
			'Whether Connect should read as Connect, Requested, Respond or Connected.',
	})
	connectionState: ConnectionState;

	constructor(
		user: User,
		distanceMetres: number,
		avatarUrl: string | null,
		connectionState: ConnectionState,
		onlineSince: Date,
	) {
		this.id = user.id;
		this.fullName = user.fullName;
		this.age = user.dateOfBirth ? ageOn(user.dateOfBirth) : null;
		this.category = user.category
			? new LookupResponseDto(user.category)
			: null;
		this.occupation = user.occupation
			? new LookupResponseDto(user.occupation)
			: null;
		this.avatarUrl = avatarUrl;
		this.distanceKm = Math.round(distanceMetres / 100) / 10;
		this.isVerified = user.kycStatus === KycStatus.Verified;
		this.isOnline = isOnline(user.lastActiveAt, onlineSince);
		this.connectionState = connectionState;
	}
}

export class DiscoveryPageDto {
	@ApiProperty({ type: [NearbyPersonDto] })
	items: NearbyPersonDto[];

	@ApiProperty({ type: PageInfoDto })
	page: PageInfoDto;

	constructor(items: NearbyPersonDto[], page: PageInfoDto) {
		this.items = items;
		this.page = page;
	}
}
