import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PageInfoDto } from '../../common/dto/pagination.dto';
import { KycStatus } from '../../users/entities/kyc-status.enum';
import type { User } from '../../users/entities/user.entity';
import type { Connection } from '../entities/connection.entity';
import { ConnectionStatus } from '../entities/connection-status.enum';

export class ConnectionPartyDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ example: 'Halima Lawal' })
	fullName: string;

	@ApiPropertyOptional({ nullable: true })
	avatarUrl: string | null;

	@ApiPropertyOptional({ example: 'Ikeja, Lagos', nullable: true })
	locationLabel: string | null;

	@ApiProperty({ example: false })
	isVerified: boolean;

	constructor(user: User, avatarUrl: string | null) {
		this.id = user.id;
		this.fullName = user.fullName;
		this.avatarUrl = avatarUrl;
		this.locationLabel = user.locationLabel;
		this.isVerified = user.kycStatus === KycStatus.Verified;
	}
}

/**
 * How a connection looks to one of its two parties. Direction is relative to
 * the viewer, because who asked is the only thing that decides whether the UI
 * offers Accept or shows Requested.
 *
 * The avatar arrives already resolved because only the storage provider knows
 * how to address a size, matching ProfileResponseDto.
 */
export class ConnectionResponseDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ enum: ConnectionStatus, enumName: 'ConnectionStatus' })
	status: ConnectionStatus;

	@ApiProperty({
		description:
			'True when the viewer sent this request rather than received it.',
	})
	isOutgoing: boolean;

	@ApiProperty({ type: ConnectionPartyDto })
	party: ConnectionPartyDto;

	@ApiProperty()
	createdAt: Date;

	@ApiPropertyOptional({ nullable: true })
	respondedAt: Date | null;

	constructor(
		connection: Connection,
		viewerId: string,
		partyAvatarUrl: string | null,
	) {
		const isOutgoing = connection.requesterId === viewerId;
		const party = isOutgoing ? connection.addressee : connection.requester;

		this.id = connection.id;
		this.status = connection.status;
		this.isOutgoing = isOutgoing;
		this.party = new ConnectionPartyDto(party, partyAvatarUrl);
		this.createdAt = connection.createdAt;
		this.respondedAt = connection.respondedAt;
	}
}

export class ConnectionPageDto {
	@ApiProperty({ type: [ConnectionResponseDto] })
	items: ConnectionResponseDto[];

	@ApiProperty({ type: PageInfoDto })
	page: PageInfoDto;

	constructor(items: ConnectionResponseDto[], page: PageInfoDto) {
		this.items = items;
		this.page = page;
	}
}
