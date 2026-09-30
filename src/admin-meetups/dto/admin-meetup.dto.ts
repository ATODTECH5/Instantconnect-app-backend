import { ApiProperty } from '@nestjs/swagger';

import { PageInfoDto } from '../../common/dto/pagination.dto';
import { ArrivalState } from '../../meetups/entities/arrival-state.enum';
import { MeetupStatus } from '../../meetups/entities/meetup-status.enum';

export class LatLngDto {
	@ApiProperty({ example: 6.4281 })
	lat: number;

	@ApiProperty({ example: 3.4219 })
	lng: number;
}

export class AdminMeetupPartyDto {
	@ApiProperty({ format: 'uuid' })
	userId: string;

	@ApiProperty({ example: 'Halima Lawal' })
	fullName: string;

	@ApiProperty({ nullable: true, type: String })
	avatarUrl: string | null;

	@ApiProperty({ description: 'Whoever proposed the meetup.' })
	isProposer: boolean;

	@ApiProperty({ enum: ArrivalState, enumName: 'ArrivalState' })
	arrivalState: ArrivalState;

	@ApiProperty({ format: 'date-time', nullable: true, type: String })
	enRouteAt: string | null;

	@ApiProperty({ format: 'date-time', nullable: true, type: String })
	arrivedAt: string | null;

	@ApiProperty({
		format: 'date-time',
		nullable: true,
		type: String,
		description: 'When the other person confirmed their arrival code.',
	})
	verifiedAt: string | null;

	@ApiProperty()
	isSharingLocation: boolean;

	@ApiProperty({
		type: LatLngDto,
		nullable: true,
		description: 'Only while they are sharing. Never a trail.',
	})
	location: LatLngDto | null;

	@ApiProperty({ format: 'date-time', nullable: true, type: String })
	locationAt: string | null;
}

export class AdminMeetupFlagDto {
	@ApiProperty({ format: 'date-time' })
	flaggedAt: string;

	@ApiProperty({ nullable: true, type: String, example: 'Daniel Danjuma' })
	flaggedByName: string | null;

	@ApiProperty({ example: 'Location sharing stopped just after arrival.' })
	reason: string;
}

export class AdminMeetupRowDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ enum: MeetupStatus, enumName: 'MeetupStatus' })
	status: MeetupStatus;

	@ApiProperty({ format: 'date-time', nullable: true, type: String })
	scheduledAt: string | null;

	@ApiProperty({
		format: 'date-time',
		nullable: true,
		type: String,
		description: 'When both arrival codes were confirmed.',
	})
	startedAt: string | null;

	@ApiProperty({ format: 'date-time', nullable: true, type: String })
	endedAt: string | null;

	@ApiProperty({ nullable: true, type: String, example: 'Café Neo' })
	venueName: string | null;

	@ApiProperty({
		nullable: true,
		type: String,
		example: 'Victoria Island, Lagos',
	})
	venueAddress: string | null;

	@ApiProperty({ type: LatLngDto, nullable: true })
	venue: LatLngDto | null;

	@ApiProperty({
		type: [AdminMeetupPartyDto],
		description: 'Proposer first.',
	})
	parties: AdminMeetupPartyDto[];

	@ApiProperty({ type: AdminMeetupFlagDto, nullable: true })
	flag: AdminMeetupFlagDto | null;
}

export class AdminMeetupPageDto {
	@ApiProperty({
		type: [AdminMeetupRowDto],
		description:
			'Ongoing: latest to start first. Past: latest to end first.',
	})
	items: AdminMeetupRowDto[];

	@ApiProperty({ type: PageInfoDto })
	page: PageInfoDto;

	constructor(items: AdminMeetupRowDto[], page: PageInfoDto) {
		this.items = items;
		this.page = page;
	}
}

export class AdminMeetupDetailDto extends AdminMeetupRowDto {
	@ApiProperty({
		format: 'date-time',
		description: 'When it was first proposed.',
	})
	proposedAt: string;

	@ApiProperty({
		format: 'date-time',
		nullable: true,
		type: String,
		description: 'When a time was accepted.',
	})
	acceptedAt: string | null;

	@ApiProperty({
		nullable: true,
		type: Number,
		description: 'Between the two live positions, when both are sharing.',
		example: 240,
	})
	distanceApartMeters: number | null;

	@ApiProperty({
		type: [String],
		format: 'date-time',
		description: 'Safety checks sent to both people, newest first.',
	})
	safetyChecksSentAt: string[];
}

export class AdminMeetupStatsDto {
	@ApiProperty({ description: 'Ongoing right now.', example: 47 })
	activeNow: number;

	@ApiProperty({
		description:
			'Meetups that started (both arrived) since midnight in Lagos.',
		example: 156,
	})
	startedToday: number;

	@ApiProperty({ description: 'The same count for yesterday.', example: 132 })
	startedYesterday: number;

	@ApiProperty({
		description: 'Currently flagged, whatever their status.',
		example: 3,
	})
	flagged: number;
}
