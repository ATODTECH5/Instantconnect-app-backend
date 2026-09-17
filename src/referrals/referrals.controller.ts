import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiNotFoundResponse,
	ApiOkResponse,
	ApiOperation,
	ApiTags,
	ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiErrorDto } from '../common/dto/api-error.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { ReferralDto, ReferralsResponseDto } from './dto/referral.dto';
import { ReferralsService } from './referrals.service';

@ApiTags('Referrals')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED', type: ApiErrorDto })
@Controller('referrals')
export class ReferralsController {
	constructor(private readonly referrals: ReferralsService) {}

	@ApiOperation({
		summary: 'The viewer’s referral code, counts and history',
		description:
			'Mints the code on first read. Counts cover every referral, not just this page.',
	})
	@ApiOkResponse({ type: ReferralsResponseDto })
	@Get()
	overview(
		@CurrentUser('id') userId: string,
		@Query() query: PaginationQueryDto,
	): Promise<ReferralsResponseDto> {
		return this.referrals.overview(userId, query);
	}

	@ApiOperation({ summary: 'One referral the viewer made' })
	@ApiOkResponse({ type: ReferralDto })
	@ApiNotFoundResponse({
		description: 'REFERRAL_NOT_FOUND',
		type: ApiErrorDto,
	})
	@Get(':id')
	get(
		@CurrentUser('id') userId: string,
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<ReferralDto> {
		return this.referrals.get(userId, id);
	}
}
