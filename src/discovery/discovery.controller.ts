import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
	ApiBadRequestResponse,
	ApiBearerAuth,
	ApiNotFoundResponse,
	ApiOkResponse,
	ApiOperation,
	ApiTags,
	ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ApiErrorDto } from '../common/dto/api-error.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DiscoveryService } from './discovery.service';
import { DiscoveryQueryDto } from './dto/discovery-query.dto';
import { DiscoveryPageDto } from './dto/nearby-person.dto';
import { PersonProfileDto } from './dto/person-profile.dto';

@ApiTags('Discovery')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED', type: ApiErrorDto })
@Controller('discovery')
export class DiscoveryController {
	constructor(private readonly discovery: DiscoveryService) {}

	@ApiOperation({
		summary: 'People near the signed in account, nearest first',
		description:
			'Backs the home carousel, the Discover grid and the People tab of search. Requires the account to have a location.',
	})
	@ApiOkResponse({ type: DiscoveryPageDto })
	@ApiBadRequestResponse({
		description: 'LOCATION_REQUIRED',
		type: ApiErrorDto,
	})
	@Get('people')
	async people(
		@CurrentUser('id') userId: string,
		@Query() query: DiscoveryQueryDto,
	): Promise<DiscoveryPageDto> {
		return this.discovery.findPeople(userId, query);
	}

	@ApiOperation({
		summary: 'One person as the profile detail screen shows them',
		description:
			'Never returns email, phone or security flags. Those belong to the account holder alone.',
	})
	@ApiOkResponse({ type: PersonProfileDto })
	@ApiNotFoundResponse({ description: 'USER_NOT_FOUND', type: ApiErrorDto })
	@ApiBadRequestResponse({
		description: 'LOCATION_REQUIRED',
		type: ApiErrorDto,
	})
	@Get('people/:id')
	async person(
		@CurrentUser('id') userId: string,
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<PersonProfileDto> {
		return this.discovery.findPerson(userId, id);
	}
}
