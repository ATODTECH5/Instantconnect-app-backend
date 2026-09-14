import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

	constructor(party: MeetupParticipant) {
		this.userId = party.userId;
		this.arrivalState = party.arrivalState;
		this.arrivedAt = party.arrivedAt;
		this.isVerified = party.verifiedAt !== null;
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
		this.me = new MeetupPartyDto(mine);
		this.party = new MeetupPartyDto(theirs);
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
