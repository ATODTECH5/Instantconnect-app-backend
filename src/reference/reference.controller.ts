import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../common/decorators/public.decorator';
import { LookupResponseDto } from './dto/lookup-response.dto';
import { ReferenceService } from './reference.service';

/**
 * Public because onboarding renders the category list before the account that
 * would authenticate the request exists.
 */
@ApiTags('Reference')
@Public()
@Controller('reference')
export class ReferenceController {
	constructor(private readonly reference: ReferenceService) {}

	@ApiOperation({ summary: 'What a user is here for, one per profile' })
	@ApiOkResponse({ type: [LookupResponseDto] })
	@Get('categories')
	async categories(): Promise<LookupResponseDto[]> {
		return LookupResponseDto.fromMany(
			await this.reference.listCategories(),
		);
	}

	@ApiOperation({ summary: 'Job titles offered by the profile picker' })
	@ApiOkResponse({ type: [LookupResponseDto] })
	@Get('occupations')
	async occupations(): Promise<LookupResponseDto[]> {
		return LookupResponseDto.fromMany(
			await this.reference.listOccupations(),
		);
	}

	@ApiOperation({ summary: 'Hobbies a profile can be tagged with' })
	@ApiOkResponse({ type: [LookupResponseDto] })
	@Get('hobbies')
	async hobbies(): Promise<LookupResponseDto[]> {
		return LookupResponseDto.fromMany(await this.reference.listHobbies());
	}
}
