import { Body, Controller, Get, Patch, Put } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateInterestsDto } from './dto/update-interests.dto';
import { UpdateSecurityDto } from './dto/update-security.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  async me(@CurrentUser('id') userId: string): Promise<UserResponseDto> {
    return new UserResponseDto(await this.users.getByIdOrFail(userId));
  }

  /**
   * The PIN and the biometric secret both stay on the device. These flags only
   * record that onboarding's steps were completed, so the app can resume in the
   * right place after a reinstall.
   */
  @Patch('me/security')
  async updateSecurity(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateSecurityDto,
  ): Promise<UserResponseDto> {
    return new UserResponseDto(await this.users.updateSecurity(userId, dto));
  }

  @Put('me/interests')
  async replaceInterests(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateInterestsDto,
  ): Promise<UserResponseDto> {
    return new UserResponseDto(
      await this.users.replaceInterests(userId, dto.interestIds),
    );
  }
}
