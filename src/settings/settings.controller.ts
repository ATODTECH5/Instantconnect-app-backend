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
	ApiNoContentResponse,
	ApiOkResponse,
	ApiOperation,
	ApiTags,
	ApiTooManyRequestsResponse,
	ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiErrorDto } from '../common/dto/api-error.dto';
import { UserResponseDto } from '../users/dto/user-response.dto';
import {
	ChangeEmailDto,
	ChangePhoneDto,
	CodeSentResponseDto,
	ConfirmCodeDto,
} from './dto/change-contact.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RequestDeletionDto } from './dto/delete-account.dto';
import {
	NotificationPreferencesResponseDto,
	UpdateNotificationPreferencesDto,
} from './dto/notification-preferences.dto';
import { SettingsService } from './settings.service';

/** Each request mails a code, so the same ceiling as the auth code endpoints. */
const CODE_THROTTLE = { default: { limit: 5, ttl: 300_000 } };

@ApiTags('Settings')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED', type: ApiErrorDto })
@Controller('settings')
export class SettingsController {
	constructor(private readonly settings: SettingsService) {}

	@ApiOperation({
		summary: 'Start changing the account email',
		description:
			'Sends a code to the new address. The current address stays until the code is confirmed.',
	})
	@ApiOkResponse({ type: CodeSentResponseDto })
	@ApiBadRequestResponse({ description: 'SAME_EMAIL', type: ApiErrorDto })
	@ApiConflictResponse({ description: 'EMAIL_TAKEN', type: ApiErrorDto })
	@ApiTooManyRequestsResponse({ type: ApiErrorDto })
	@Throttle(CODE_THROTTLE)
	@Post('email/change')
	@HttpCode(HttpStatus.OK)
	requestEmailChange(
		@CurrentUser('id') userId: string,
		@Body() dto: ChangeEmailDto,
	): Promise<CodeSentResponseDto> {
		return this.settings.requestEmailChange(userId, dto.email);
	}

	@ApiOperation({ summary: 'Confirm the new email with its code' })
	@ApiOkResponse({ type: UserResponseDto })
	@ApiBadRequestResponse({
		description: 'INVALID_CODE or NOTHING_PENDING',
		type: ApiErrorDto,
	})
	@Post('email/confirm')
	@HttpCode(HttpStatus.OK)
	async confirmEmailChange(
		@CurrentUser('id') userId: string,
		@Body() dto: ConfirmCodeDto,
	): Promise<UserResponseDto> {
		return new UserResponseDto(
			await this.settings.confirmEmailChange(userId, dto.code),
		);
	}

	@ApiOperation({
		summary: 'Start changing the account phone number',
		description:
			'No SMS channel exists yet, so the code goes to the account email.',
	})
	@ApiOkResponse({ type: CodeSentResponseDto })
	@ApiBadRequestResponse({ description: 'SAME_PHONE', type: ApiErrorDto })
	@ApiConflictResponse({ description: 'PHONE_TAKEN', type: ApiErrorDto })
	@ApiTooManyRequestsResponse({ type: ApiErrorDto })
	@Throttle(CODE_THROTTLE)
	@Post('phone/change')
	@HttpCode(HttpStatus.OK)
	requestPhoneChange(
		@CurrentUser('id') userId: string,
		@Body() dto: ChangePhoneDto,
	): Promise<CodeSentResponseDto> {
		return this.settings.requestPhoneChange(userId, dto.phone);
	}

	@ApiOperation({ summary: 'Confirm the new phone number with its code' })
	@ApiOkResponse({ type: UserResponseDto })
	@ApiBadRequestResponse({
		description: 'INVALID_CODE or NOTHING_PENDING',
		type: ApiErrorDto,
	})
	@Post('phone/confirm')
	@HttpCode(HttpStatus.OK)
	async confirmPhoneChange(
		@CurrentUser('id') userId: string,
		@Body() dto: ConfirmCodeDto,
	): Promise<UserResponseDto> {
		return new UserResponseDto(
			await this.settings.confirmPhoneChange(userId, dto.code),
		);
	}

	@ApiOperation({
		summary: 'Change the password',
		description:
			'Needs the current password. Every session is signed out, including this one at its next refresh.',
	})
	@ApiNoContentResponse()
	@ApiBadRequestResponse({
		description: 'NO_PASSWORD, SAME_PASSWORD or VALIDATION_FAILED',
		type: ApiErrorDto,
	})
	@Put('password')
	@HttpCode(HttpStatus.NO_CONTENT)
	changePassword(
		@CurrentUser('id') userId: string,
		@Body() dto: ChangePasswordDto,
	): Promise<void> {
		return this.settings.changePassword(userId, dto);
	}

	@ApiOperation({ summary: 'Read notification preferences' })
	@ApiOkResponse({ type: NotificationPreferencesResponseDto })
	@Get('notifications')
	async notificationPreferences(
		@CurrentUser('id') userId: string,
	): Promise<NotificationPreferencesResponseDto> {
		return new NotificationPreferencesResponseDto(
			await this.settings.getNotificationPreferences(userId),
		);
	}

	@ApiOperation({
		summary: 'Update notification preferences',
		description: 'Only the keys sent are changed.',
	})
	@ApiOkResponse({ type: NotificationPreferencesResponseDto })
	@Patch('notifications')
	async updateNotificationPreferences(
		@CurrentUser('id') userId: string,
		@Body() dto: UpdateNotificationPreferencesDto,
	): Promise<NotificationPreferencesResponseDto> {
		return new NotificationPreferencesResponseDto(
			await this.settings.updateNotificationPreferences(userId, dto),
		);
	}

	@ApiOperation({
		summary: 'Ask to delete the account',
		description:
			'Records the reason and sends a confirmation code to the account email. Nothing is deleted until the code is confirmed.',
	})
	@ApiOkResponse({ type: CodeSentResponseDto })
	@ApiTooManyRequestsResponse({ type: ApiErrorDto })
	@Throttle(CODE_THROTTLE)
	@Post('account/delete')
	@HttpCode(HttpStatus.OK)
	requestDeletion(
		@CurrentUser('id') userId: string,
		@Body() dto: RequestDeletionDto,
	): Promise<CodeSentResponseDto> {
		return this.settings.requestDeletion(userId, dto);
	}

	@ApiOperation({
		summary: 'Confirm the deletion with its code',
		description:
			'Soft deletes the account and revokes every session. The email and phone become free to register again.',
	})
	@ApiNoContentResponse()
	@ApiBadRequestResponse({ description: 'INVALID_CODE', type: ApiErrorDto })
	@Post('account/delete/confirm')
	@HttpCode(HttpStatus.NO_CONTENT)
	confirmDeletion(
		@CurrentUser('id') userId: string,
		@Body() dto: ConfirmCodeDto,
	): Promise<void> {
		return this.settings.confirmDeletion(userId, dto.code);
	}
}
