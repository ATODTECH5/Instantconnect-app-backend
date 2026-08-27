import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { LookupResponseDto } from '../../reference/dto/lookup-response.dto';
import { KycStatus } from '../entities/kyc-status.enum';
import { AVATAR_POSITION } from '../entities/user-photo.entity';
import type { User } from '../entities/user.entity';

export class ProfilePhotoDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({
		description: '0 is the avatar, 1 to 3 are the gallery slots.',
		example: 1,
	})
	position: number;

	@ApiProperty({
		description: 'Square crop for avatars and gallery squares.',
		example:
			'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_256,h_256,c_fill,g_face/a',
	})
	thumbnailUrl: string;

	@ApiProperty({
		description: 'The size a photo is opened at.',
		example:
			'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_900,c_limit/a',
	})
	url: string;
}

/**
 * Counts the profile header shows. Connections, events and communities are not
 * modelled yet, so they read zero until those modules land rather than being
 * faked in the client.
 */
export class ProfileStatsDto {
	@ApiProperty({ example: 0 })
	connections: number;

	@ApiProperty({ example: 0 })
	eventsJoined: number;

	@ApiProperty({ example: 0 })
	communities: number;
}

export class ProfileResponseDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ example: 'Halima Lawal' })
	fullName: string;

	@ApiPropertyOptional({
		description: 'Stored without the leading @, which the client adds.',
		example: 'leemah',
		nullable: true,
	})
	username: string | null;

	@ApiPropertyOptional({ nullable: true })
	bio: string | null;

	@ApiPropertyOptional({ type: LookupResponseDto, nullable: true })
	category: LookupResponseDto | null;

	@ApiPropertyOptional({ type: LookupResponseDto, nullable: true })
	occupation: LookupResponseDto | null;

	@ApiPropertyOptional({ example: 'Ikeja, Lagos', nullable: true })
	locationLabel: string | null;

	@ApiProperty({ type: [LookupResponseDto] })
	hobbies: LookupResponseDto[];

	@ApiPropertyOptional({
		description:
			'Position 0 at thumbnail size, lifted out so the header does not have to search.',
		nullable: true,
	})
	avatarUrl: string | null;

	@ApiProperty({
		type: [ProfilePhotoDto],
		description: 'Gallery slots only. The avatar is exposed as avatarUrl.',
	})
	photos: ProfilePhotoDto[];

	@ApiProperty({
		enum: KycStatus,
		enumName: 'KycStatus',
		example: KycStatus.None,
	})
	kycStatus: KycStatus;

	@ApiProperty({
		description:
			'Drives the badge beside the name. True only once KYC passes.',
		example: false,
	})
	isVerified: boolean;

	@ApiProperty({ type: ProfileStatsDto })
	stats: ProfileStatsDto;

	/**
	 * Photos arrive already resolved to URLs because only the storage provider
	 * knows how to address a size, and this stays a plain shape.
	 */
	constructor(user: User, stats: ProfileStatsDto, photos: ProfilePhotoDto[]) {
		const avatar = photos.find(
			(photo) => photo.position === AVATAR_POSITION,
		);

		this.id = user.id;
		this.fullName = user.fullName;
		this.username = user.username;
		this.bio = user.bio;
		this.category = user.category
			? new LookupResponseDto(user.category)
			: null;
		this.occupation = user.occupation
			? new LookupResponseDto(user.occupation)
			: null;
		this.locationLabel = user.locationLabel;
		this.hobbies = LookupResponseDto.fromMany(user.hobbies ?? []);
		this.avatarUrl = avatar?.thumbnailUrl ?? null;
		this.photos = photos
			.filter((photo) => photo.position !== AVATAR_POSITION)
			.sort((a, b) => a.position - b.position);
		this.kycStatus = user.kycStatus;
		this.isVerified = user.kycStatus === KycStatus.Verified;
		this.stats = stats;
	}
}
