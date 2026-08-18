import { Controller, Get } from '@nestjs/common';

import { Public } from '../common/decorators/public.decorator';
import { InterestResponseDto } from './dto/interest-response.dto';
import { InterestsService } from './interests.service';

@Controller('interests')
export class InterestsController {
  constructor(private readonly interests: InterestsService) {}

  @Public()
  @Get()
  async list(): Promise<InterestResponseDto[]> {
    return InterestResponseDto.fromMany(await this.interests.findActive());
  }
}
