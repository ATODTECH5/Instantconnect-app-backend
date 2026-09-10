import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ageOn } from '../../common/utils/age.util';
import type { ConnectionState } from '../../connections/connection-state';
import { LookupResponseDto } from '../../reference/dto/lookup-response.dto';
import { KycStatus } from '../../users/entities/kyc-status.enum';
import type { User } from '../../users/entities/user.entity';

/**
 * Somebody else's profile as the person detail screen shows it. Deliberately
 * narrower than ProfileResponseDto: email, phone and the security flags belong
 * to the account holder alone and must never reach another user.
 */
export class PersonProfileDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ example: 'Iyan Filani' })
	fullName: string;

	@ApiPropertyOptional({ example: 27, nullable: true })
	age: number | null;

	@ApiPropertyOptional({ nullable: true })
	bio: string | null;

	@ApiPropertyOptional({ type: LookupResponseDto, nullable: true })
	category: LookupResponseDto | null;

	@ApiPropertyOptional({ type: LookupResponseDto, nullable: true })
	occupation: LookupResponseDto | null;

	@ApiProperty({ type: [LookupResponseDto] })
	hobbies: LookupResponseDto[];

	@ApiPropertyOptional({ example: 'Ikeja, Lagos', nullable: true })
	locationLabel: string | null;

	@ApiPropertyOptional({ nullable: true })
	avatarUrl: string | null;

	@ApiProperty({
		type: [String],
		description: 'Gallery photos at full size, avatar excluded.',
	})
	photoUrls: string[];

	@ApiProperty({ example: 1.8 })
	distanceKm: number;

	@ApiProperty({ example: false })
	isVerified: boolean;

	@ApiProperty({
		description: 'Seen within the online window.',
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
	})
	connectionState: ConnectionState;

	constructor(
		user: User,
		distanceMetres: number,
		avatarUrl: string | null,
		photoUrls: string[],
		connectionState: ConnectionState,
		isOnline: boolean,
	) {
		this.id = user.id;
		this.fullName = user.fullName;
		this.age = user.dateOfBirth ? ageOn(user.dateOfBirth) : null;
		this.bio = user.bio;
		this.category = user.category
			? new LookupResponseDto(user.category)
			: null;
		this.occupation = user.occupation
			? new LookupResponseDto(user.occupation)
			: null;
		this.hobbies = LookupResponseDto.fromMany(user.hobbies ?? []);
		this.locationLabel = user.locationLabel;
		this.avatarUrl = avatarUrl;
		this.photoUrls = photoUrls;
		this.distanceKm = Math.round(distanceMetres / 100) / 10;
		this.isVerified = user.kycStatus === KycStatus.Verified;
		this.isOnline = isOnline;
		this.connectionState = connectionState;
	}
}
