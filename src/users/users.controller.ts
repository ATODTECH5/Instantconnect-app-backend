import { Body, Controller, Get, Patch, Put } from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiNotFoundResponse,
	ApiOkResponse,
	ApiOperation,
	ApiTags,
	ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ApiErrorDto } from '../common/dto/api-error.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateInterestsDto } from './dto/update-interests.dto';
import { UpdateSecurityDto } from './dto/update-security.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED', type: ApiErrorDto })
@ApiNotFoundResponse({ description: 'USER_NOT_FOUND', type: ApiErrorDto })
@Controller('users')
export class UsersController {
	constructor(private readonly users: UsersService) {}

	@ApiOperation({ summary: 'Read the signed in account' })
	@ApiOkResponse({ type: UserResponseDto })
	@Get('me')
	async me(@CurrentUser('id') userId: string): Promise<UserResponseDto> {
		return new UserResponseDto(await this.users.getByIdOrFail(userId));
	}

	/**
	 * The PIN and the biometric secret both stay on the device. These flags only
	 * record that onboarding's steps were completed, so the app can resume in the
	 * right place after a reinstall.
	 */
	@ApiOperation({
		summary: 'Record which device unlock steps are done',
		description:
			'Flags only. The PIN and the biometric secret never leave the device, so neither is accepted here.',
	})
	@ApiOkResponse({ type: UserResponseDto })
	@Patch('me/security')
	async updateSecurity(
		@CurrentUser('id') userId: string,
		@Body() dto: UpdateSecurityDto,
	): Promise<UserResponseDto> {
		return new UserResponseDto(
			await this.users.updateSecurity(userId, dto),
		);
	}

	@ApiOperation({
		summary: 'Replace the account interests',
		description:
			'The list is the whole selection, not an addition. Unknown ids are rejected.',
	})
	@ApiOkResponse({ type: UserResponseDto })
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
