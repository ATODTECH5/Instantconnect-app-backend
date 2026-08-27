import { Body, Controller, Get, Patch, Put } from '@nestjs/common';
import {
	ApiBadRequestResponse,
	ApiBearerAuth,
	ApiConflictResponse,
	ApiNotFoundResponse,
	ApiOkResponse,
	ApiOperation,
	ApiTags,
	ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ApiErrorDto } from '../common/dto/api-error.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ProfileResponseDto } from './dto/profile-response.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
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
		summary: 'Set what the account is here for',
		description:
			'One category per account. Ids come from GET /reference/categories.',
	})
	@ApiOkResponse({ type: UserResponseDto })
	@ApiBadRequestResponse({
		description: 'UNKNOWN_CATEGORY',
		type: ApiErrorDto,
	})
	@Put('me/category')
	async setCategory(
		@CurrentUser('id') userId: string,
		@Body() dto: UpdateCategoryDto,
	): Promise<UserResponseDto> {
		return new UserResponseDto(
			await this.users.setCategory(userId, dto.categoryId),
		);
	}

	@ApiOperation({ summary: 'Read the signed in profile' })
	@ApiOkResponse({ type: ProfileResponseDto })
	@Get('me/profile')
	async profile(
		@CurrentUser('id') userId: string,
	): Promise<ProfileResponseDto> {
		return this.users.getProfile(userId);
	}

	@ApiOperation({
		summary: 'Update the profile',
		description:
			'Only the keys sent are changed. Sending null clears a field; omitting it leaves it alone.',
	})
	@ApiOkResponse({ type: ProfileResponseDto })
	@ApiBadRequestResponse({
		description: 'UNKNOWN_CATEGORY, UNKNOWN_OCCUPATION or UNKNOWN_HOBBY',
		type: ApiErrorDto,
	})
	@ApiConflictResponse({ description: 'USERNAME_TAKEN', type: ApiErrorDto })
	@Patch('me/profile')
	async updateProfile(
		@CurrentUser('id') userId: string,
		@Body() dto: UpdateProfileDto,
	): Promise<ProfileResponseDto> {
		return this.users.toProfile(
			await this.users.updateProfile(userId, dto),
		);
	}
}
