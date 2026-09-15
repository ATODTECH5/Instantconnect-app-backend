import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
	Post,
	Put,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiOkResponse,
	ApiOperation,
	ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
	AddMemberDto,
	CircleListResponseDto,
	CircleResponseDto,
	CreateCircleDto,
	DispatchPlanDto,
	DispatchResultDto,
	SelectCirclesDto,
} from './dto/circle.dto';
import { SafetyService } from './safety.service';

/** A manual check-in emails real people; a stuck button must not spam them. */
const CHECK_IN_THROTTLE = { default: { limit: 3, ttl: 600_000 } };

@ApiTags('safety')
@ApiBearerAuth()
@Controller('safety')
export class SafetyController {
	constructor(private readonly safety: SafetyService) {}

	@Get('circles')
	@ApiOkResponse({ type: CircleListResponseDto })
	list(@CurrentUser('id') userId: string): Promise<CircleListResponseDto> {
		return this.safety.list(userId);
	}

	@Post('circles')
	@ApiOkResponse({ type: CircleResponseDto })
	create(
		@CurrentUser('id') userId: string,
		@Body() body: CreateCircleDto,
	): Promise<CircleResponseDto> {
		return this.safety.create(userId, body);
	}

	@Delete('circles/:id')
	@HttpCode(HttpStatus.NO_CONTENT)
	remove(
		@CurrentUser('id') userId: string,
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<void> {
		return this.safety.remove(userId, id);
	}

	@Post('circles/:id/members')
	@ApiOperation({ summary: 'Add an outside contact by name and email' })
	@ApiOkResponse({ type: CircleResponseDto })
	addMember(
		@CurrentUser('id') userId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Body() body: AddMemberDto,
	): Promise<CircleResponseDto> {
		return this.safety.addMember(userId, id, body);
	}

	@Delete('circles/:id/members/:memberId')
	@ApiOkResponse({ type: CircleResponseDto })
	removeMember(
		@CurrentUser('id') userId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Param('memberId', ParseUUIDPipe) memberId: string,
	): Promise<CircleResponseDto> {
		return this.safety.removeMember(userId, id, memberId);
	}

	@Get('meetups/:meetupId/dispatch')
	@ApiOperation({
		summary:
			'Which circles will hear about this meetup, and what they will be told',
	})
	@ApiOkResponse({ type: DispatchPlanDto })
	plan(
		@CurrentUser('id') userId: string,
		@Param('meetupId', ParseUUIDPipe) meetupId: string,
	): Promise<DispatchPlanDto> {
		return this.safety.planForMeetup(userId, meetupId);
	}

	@Put('meetups/:meetupId/circles')
	@ApiOperation({
		summary: 'Replace the circles that will hear about this meetup',
	})
	@ApiOkResponse({ type: [String] })
	select(
		@CurrentUser('id') userId: string,
		@Param('meetupId', ParseUUIDPipe) meetupId: string,
		@Body() body: SelectCirclesDto,
	): Promise<string[]> {
		return this.safety.selectForMeetup(userId, meetupId, body);
	}

	@Post('meetups/:meetupId/check-in')
	@HttpCode(HttpStatus.OK)
	@Throttle(CHECK_IN_THROTTLE)
	@ApiOperation({
		summary: 'Send a "safe check-in" email to your selected circles now',
		description:
			'Idempotent per contact: someone already told for this meetup is not told again.',
	})
	@ApiOkResponse({ type: DispatchResultDto })
	checkIn(
		@CurrentUser('id') userId: string,
		@Param('meetupId', ParseUUIDPipe) meetupId: string,
	): Promise<DispatchResultDto> {
		return this.safety.sendManual(userId, meetupId);
	}
}
