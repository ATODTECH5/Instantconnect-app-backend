import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { type GeoPoint, haversineMetres } from '../../common/utils/geo.util';
import { ArrivalState } from '../entities/arrival-state.enum';
import type { Meetup } from '../entities/meetup.entity';
import type { MeetupParticipant } from '../entities/meetup-participant.entity';
import { MeetupStatus } from '../entities/meetup-status.enum';

export class MeetupVenueResponseDto {
	@ApiProperty()
	name: string;

	@ApiPropertyOptional({ nullable: true })
	address: string | null;

	@ApiPropertyOptional({ nullable: true })
	latitude: number | null;

	@ApiPropertyOptional({ nullable: true })
	longitude: number | null;

	constructor(meetup: Meetup) {
		this.name = meetup.venueName ?? '';
		this.address = meetup.venueAddress;
		// GeoJSON is [longitude, latitude]; the API speaks latitude first.
		this.latitude = meetup.venueLocation?.coordinates[1] ?? null;
		this.longitude = meetup.venueLocation?.coordinates[0] ?? null;
	}
}

/**
 * GPS at a venue is rarely better than a few tens of metres, and a venue is
 * a building rather than a point, so the zone is generous.
 */
export const SAFE_ZONE_RADIUS_M = 150;

export class MeetupPointDto {
	@ApiProperty()
	latitude: number;

	@ApiProperty()
	longitude: number;

	constructor(point: GeoPoint) {
		this.latitude = point.coordinates[1];
		this.longitude = point.coordinates[0];
	}
}

export class MeetupPartyDto {
	@ApiProperty({ format: 'uuid' })
	userId: string;

	@ApiProperty({ enum: ArrivalState, enumName: 'ArrivalState' })
	arrivalState: ArrivalState;

	@ApiPropertyOptional({ nullable: true })
	arrivedAt: Date | null;

	@ApiProperty({
		description: 'The other party confirmed this person arrived.',
	})
	isVerified: boolean;

	@ApiPropertyOptional({
		nullable: true,
		description:
			"When this person's current arrival code stops working, or null if none has been issued. The code itself is only ever returned by the issue endpoint.",
	})
	codeExpiresAt: Date | null;

	@ApiProperty({ description: 'This person has live location switched on.' })
	isSharingLocation: boolean;

	@ApiPropertyOptional({
		type: MeetupPointDto,
		nullable: true,
		description:
			'Last reported fix. Null unless sharing is on and a fix has been reported.',
	})
	location: MeetupPointDto | null;

	@ApiPropertyOptional({ nullable: true })
	locationAt: Date | null;

	@ApiPropertyOptional({
		nullable: true,
		description:
			'Metres from the venue at the last fix. Null without a venue or a fix.',
	})
	distanceToVenueM: number | null;

	@ApiPropertyOptional({
		nullable: true,
		description:
			'Inside the safe-zone radius at the last fix. Null when unknowable.',
	})
	isInSafeZone: boolean | null;

	constructor(party: MeetupParticipant, meetup: Meetup) {
		this.userId = party.userId;
		this.arrivalState = party.arrivalState;
		this.arrivedAt = party.arrivedAt;
		this.isVerified = party.verifiedAt !== null;
		this.codeExpiresAt = party.arrivalCodeExpiresAt;
		this.isSharingLocation = party.isSharingLocation;

		// Sharing off means nothing to show, whatever the row still holds.
		const fix = party.isSharingLocation ? party.lastLocation : null;

		this.location = fix ? new MeetupPointDto(fix) : null;
		this.locationAt = fix ? party.lastLocationAt : null;
		this.distanceToVenueM =
			fix && meetup.venueLocation
				? Math.round(haversineMetres(fix, meetup.venueLocation))
				: null;
		this.isInSafeZone =
			this.distanceToVenueM === null
				? null
				: this.distanceToVenueM <= SAFE_ZONE_RADIUS_M;
	}
}

/**
 * Everything a card or a meetup screen needs, with the viewer-relative flags
 * worked out server side so the client never has to reason about roles.
 */
export class MeetupResponseDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ format: 'uuid' })
	conversationId: string;

	@ApiProperty({ enum: MeetupStatus, enumName: 'MeetupStatus' })
	status: MeetupStatus;

	@ApiProperty({ type: [String] })
	proposedTimes: string[];

	@ApiPropertyOptional({ nullable: true })
	scheduledAt: Date | null;

	@ApiPropertyOptional({ type: MeetupVenueResponseDto, nullable: true })
	venue: MeetupVenueResponseDto | null;

	@ApiProperty({ description: 'The viewer opened the first proposal.' })
	isProposer: boolean;

	@ApiProperty({
		description:
			'While proposed: the viewer is the one who must accept, decline or counter.',
	})
	isAwaitingMe: boolean;

	@ApiProperty({ type: MeetupPartyDto })
	me: MeetupPartyDto;

	@ApiProperty({ type: MeetupPartyDto })
	party: MeetupPartyDto;

	@ApiProperty({
		description:
			'So the client draws the same circle the server judges by.',
	})
	safeZoneRadiusM: number;

	@ApiProperty()
	createdAt: Date;

	@ApiPropertyOptional({ nullable: true })
	endedAt: Date | null;

	constructor(meetup: Meetup, viewerId: string) {
		const mine = meetup.participants.find((p) => p.userId === viewerId);
		const theirs = meetup.participants.find((p) => p.userId !== viewerId);

		if (!mine || !theirs) {
			// A meetup always has exactly two participants; reaching here means
			// the caller built the DTO for someone outside it.
			throw new Error('Meetup response built for a non-participant');
		}

		this.id = meetup.id;
		this.conversationId = meetup.conversationId;
		this.status = meetup.status;
		this.proposedTimes = meetup.proposedTimes;
		this.scheduledAt = meetup.scheduledAt;
		this.venue = meetup.venueName
			? new MeetupVenueResponseDto(meetup)
			: null;
		this.isProposer = meetup.proposerId === viewerId;
		this.isAwaitingMe =
			meetup.status === MeetupStatus.Proposed &&
			meetup.awaitingUserId === viewerId;
		this.me = new MeetupPartyDto(mine, meetup);
		this.party = new MeetupPartyDto(theirs, meetup);
		this.safeZoneRadiusM = SAFE_ZONE_RADIUS_M;
		this.createdAt = meetup.createdAt;
		this.endedAt = meetup.endedAt;
	}
}

/** Null is a normal answer here, so it travels inside an object rather than as an empty body. */
export class OpenMeetupResponseDto {
	@ApiPropertyOptional({ type: MeetupResponseDto, nullable: true })
	meetup: MeetupResponseDto | null;

	constructor(meetup: MeetupResponseDto | null) {
		this.meetup = meetup;
	}
}

/** Returned once, at issue. The server keeps only a hash. */
export class ArrivalCodeResponseDto {
	@ApiProperty({
		example: '4917',
		description: 'Show this to the other party.',
	})
	code: string;

	@ApiProperty()
	expiresAt: Date;

	@ApiProperty({ type: MeetupResponseDto })
	meetup: MeetupResponseDto;

	constructor(code: string, expiresAt: Date, meetup: MeetupResponseDto) {
		this.code = code;
		this.expiresAt = expiresAt;
		this.meetup = meetup;
	}
}

export class VerifyCodeResponseDto {
	@ApiProperty()
	verified: boolean;

	@ApiProperty({
		description:
			'Wrong guesses left before the other party has to issue a new code. Meaningless when verified.',
	})
	attemptsLeft: number;

	@ApiProperty({ type: MeetupResponseDto })
	meetup: MeetupResponseDto;

	constructor(
		verified: boolean,
		attemptsLeft: number,
		meetup: MeetupResponseDto,
	) {
		this.verified = verified;
		this.attemptsLeft = attemptsLeft;
		this.meetup = meetup;
	}
}
