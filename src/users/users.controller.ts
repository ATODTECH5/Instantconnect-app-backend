import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Patch,
	Post,
	Put,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
	ApiBadRequestResponse,
	ApiBearerAuth,
	ApiConflictResponse,
	ApiNotFoundResponse,
	ApiOkResponse,
	ApiOperation,
	ApiTags,
	ApiTooManyRequestsResponse,
	ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ApiErrorDto } from '../common/dto/api-error.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
	PinVerificationResponseDto,
	SetPinDto,
	VerifyPinDto,
} from './dto/pin.dto';
import { ProfileResponseDto } from './dto/profile-response.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateSecurityDto } from './dto/update-security.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

/**
 * Five per five minutes. A four digit PIN is 10,000 guesses, so the limit is
 * what makes it a credential rather than a formality. Per IP like every other
 * throttle here, which is the weaker of the two options for a device unlock —
 * revisit if PIN entry ever gates something that matters more than app re-entry.
 */
const PIN_THROTTLE = { default: { limit: 5, ttl: 300_000 } };

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
		summary: 'Set or replace the account PIN',
		description:
			'Stored as an argon2id hash. Replaces any existing PIN and sets pinEnabled.',
	})
	@ApiOkResponse({ type: UserResponseDto })
	@ApiBadRequestResponse({
		description: 'WEAK_PIN or VALIDATION_FAILED',
		type: ApiErrorDto,
	})
	@Put('me/pin')
	async setPin(
		@CurrentUser('id') userId: string,
		@Body() dto: SetPinDto,
	): Promise<UserResponseDto> {
		return new UserResponseDto(await this.users.setPin(userId, dto.pin));
	}

	@ApiOperation({
		summary: 'Check a PIN',
		description:
			'Answers whether the PIN matches. An account with no PIN set answers false, so a caller cannot tell the two apart.',
	})
	@ApiOkResponse({ type: PinVerificationResponseDto })
	@ApiTooManyRequestsResponse({
		description: 'Rate limited',
		type: ApiErrorDto,
	})
	@Throttle(PIN_THROTTLE)
	@Post('me/pin/verify')
	@HttpCode(HttpStatus.OK)
	async verifyPin(
		@CurrentUser('id') userId: string,
		@Body() dto: VerifyPinDto,
	): Promise<PinVerificationResponseDto> {
		return new PinVerificationResponseDto(
			await this.users.verifyPin(userId, dto.pin),
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
