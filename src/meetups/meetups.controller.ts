import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
	Patch,
	Post,
	Query,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiOkResponse,
	ApiOperation,
	ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AcceptMeetupDto } from './dto/accept-meetup.dto';
import { ReportLocationDto, SetLocationSharingDto } from './dto/location.dto';
import {
	ArrivalCodeResponseDto,
	MeetupPartyDto,
	MeetupResponseDto,
	OpenMeetupResponseDto,
	VerifyCodeResponseDto,
} from './dto/meetup-response.dto';
import { CounterMeetupDto, ProposeMeetupDto } from './dto/propose-meetup.dto';
import { SetArrivalDto } from './dto/set-arrival.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { MeetupsService } from './meetups.service';

/**
 * Transitions are verbs, not a PATCH of `status`: each has its own guard, and
 * naming them keeps the client from ever writing a state the server has to
 * second-guess.
 */
/**
 * Same shape as the PIN throttle: a four digit space needs the route rate
 * limited as well as the per-code attempt counter, or a script could burn
 * through codes faster than a person could reissue them.
 */
const VERIFY_THROTTLE = { default: { limit: 5, ttl: 300_000 } };

/** Fixes arrive every several seconds; the global limit would starve them. */
const LOCATION_THROTTLE = { default: { limit: 60, ttl: 60_000 } };

@ApiTags('meetups')
@ApiBearerAuth()
@Controller('meetups')
export class MeetupsController {
	constructor(private readonly meetups: MeetupsService) {}

	@Post()
	@ApiOperation({ summary: 'Propose times to meet, inside a conversation' })
	@ApiOkResponse({ type: MeetupResponseDto })
	propose(
		@CurrentUser('id') userId: string,
		@Body() body: ProposeMeetupDto,
	): Promise<MeetupResponseDto> {
		return this.meetups.propose(userId, body);
	}

	@Get('open')
	@ApiOperation({
		summary: 'The one open meetup in a conversation, or null',
	})
	@ApiOkResponse({ type: OpenMeetupResponseDto })
	async open(
		@CurrentUser('id') userId: string,
		@Query('conversationId', ParseUUIDPipe) conversationId: string,
	): Promise<OpenMeetupResponseDto> {
		return new OpenMeetupResponseDto(
			await this.meetups.openForConversation(userId, conversationId),
		);
	}

	@Get(':id')
	@ApiOkResponse({ type: MeetupResponseDto })
	get(
		@CurrentUser('id') userId: string,
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<MeetupResponseDto> {
		return this.meetups.get(userId, id);
	}

	@Post(':id/accept')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Accept one of the proposed times' })
	@ApiOkResponse({ type: MeetupResponseDto })
	accept(
		@CurrentUser('id') userId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Body() body: AcceptMeetupDto,
	): Promise<MeetupResponseDto> {
		return this.meetups.accept(userId, id, body);
	}

	@Post(':id/decline')
	@HttpCode(HttpStatus.OK)
	@ApiOkResponse({ type: MeetupResponseDto })
	decline(
		@CurrentUser('id') userId: string,
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<MeetupResponseDto> {
		return this.meetups.decline(userId, id);
	}

	@Post(':id/counter')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Suggest other times; hands the answer back' })
	@ApiOkResponse({ type: MeetupResponseDto })
	counter(
		@CurrentUser('id') userId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Body() body: CounterMeetupDto,
	): Promise<MeetupResponseDto> {
		return this.meetups.counter(userId, id, body);
	}

	@Post(':id/cancel')
	@HttpCode(HttpStatus.OK)
	@ApiOkResponse({ type: MeetupResponseDto })
	cancel(
		@CurrentUser('id') userId: string,
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<MeetupResponseDto> {
		return this.meetups.cancel(userId, id);
	}

	@Post(':id/end')
	@HttpCode(HttpStatus.OK)
	@ApiOkResponse({ type: MeetupResponseDto })
	end(
		@CurrentUser('id') userId: string,
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<MeetupResponseDto> {
		return this.meetups.end(userId, id);
	}

	@Post(':id/arrival-code')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: "Issue or reissue the viewer's own arrival code",
		description:
			'The plain code is returned once and never again. Reissuing burns the previous one.',
	})
	@ApiOkResponse({ type: ArrivalCodeResponseDto })
	issueCode(
		@CurrentUser('id') userId: string,
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<ArrivalCodeResponseDto> {
		return this.meetups.issueArrivalCode(userId, id);
	}

	@Post(':id/verify-code')
	@HttpCode(HttpStatus.OK)
	@Throttle(VERIFY_THROTTLE)
	@ApiOperation({
		summary: "Enter the other party's code to confirm they arrived",
		description:
			'Five wrong guesses burn their code. When both parties are verified the meetup becomes active.',
	})
	@ApiOkResponse({ type: VerifyCodeResponseDto })
	verifyCode(
		@CurrentUser('id') userId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Body() body: VerifyCodeDto,
	): Promise<VerifyCodeResponseDto> {
		return this.meetups.verifyArrivalCode(userId, id, body);
	}

	@Patch(':id/location-sharing')
	@ApiOperation({
		summary: 'Switch live location on or off for the viewer',
		description: 'Off also discards the last reported fix.',
	})
	@ApiOkResponse({ type: MeetupResponseDto })
	locationSharing(
		@CurrentUser('id') userId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Body() body: SetLocationSharingDto,
	): Promise<MeetupResponseDto> {
		return this.meetups.setLocationSharing(userId, id, body);
	}

	@Post(':id/location')
	@HttpCode(HttpStatus.OK)
	@Throttle(LOCATION_THROTTLE)
	@ApiOperation({
		summary: "Report the viewer's current position",
		description:
			'Stored as the single latest fix and relayed to the other party only. Refused unless sharing is on.',
	})
	@ApiOkResponse({ type: MeetupPartyDto })
	location(
		@CurrentUser('id') userId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Body() body: ReportLocationDto,
	): Promise<MeetupPartyDto> {
		return this.meetups.reportLocation(userId, id, body);
	}

	@Patch(':id/arrival')
	@ApiOperation({ summary: "Update the viewer's own travel state" })
	@ApiOkResponse({ type: MeetupResponseDto })
	arrival(
		@CurrentUser('id') userId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Body() body: SetArrivalDto,
	): Promise<MeetupResponseDto> {
		return this.meetups.setArrival(userId, id, body);
	}
}
