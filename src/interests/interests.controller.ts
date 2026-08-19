import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../common/decorators/public.decorator';
import { InterestResponseDto } from './dto/interest-response.dto';
import { InterestsService } from './interests.service';

@ApiTags('Interests')
@Controller('interests')
export class InterestsController {
	constructor(private readonly interests: InterestsService) {}

	@ApiOperation({ summary: 'List the interests offered during onboarding' })
	@ApiOkResponse({ type: [InterestResponseDto] })
	@Public()
	@Get()
	async list(): Promise<InterestResponseDto[]> {
		return InterestResponseDto.fromMany(await this.interests.findActive());
	}
}
