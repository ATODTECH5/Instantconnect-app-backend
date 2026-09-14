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

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AcceptMeetupDto } from './dto/accept-meetup.dto';
import {
	MeetupResponseDto,
	OpenMeetupResponseDto,
} from './dto/meetup-response.dto';
import { CounterMeetupDto, ProposeMeetupDto } from './dto/propose-meetup.dto';
import { SetArrivalDto } from './dto/set-arrival.dto';
import { MeetupsService } from './meetups.service';

/**
 * Transitions are verbs, not a PATCH of `status`: each has its own guard, and
 * naming them keeps the client from ever writing a state the server has to
 * second-guess.
 */
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
