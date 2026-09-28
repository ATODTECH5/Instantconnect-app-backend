import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
	ApiBadRequestResponse,
	ApiForbiddenResponse,
	ApiOkResponse,
	ApiOperation,
	ApiTags,
	ApiTooManyRequestsResponse,
	ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { ApiErrorDto } from '../common/dto/api-error.dto';
import { Public } from '../common/decorators/public.decorator';
import { AdminSignInDto } from './dto/admin-sign-in.dto';
import { SessionResponseDto } from './dto/session-response.dto';
import { AuthService } from './auth.service';
import { Session } from './session-context.decorator';
import type { SessionContext } from './token-payload';

@ApiTags('Admin Auth')
@ApiBadRequestResponse({ description: 'VALIDATION_FAILED', type: ApiErrorDto })
@ApiTooManyRequestsResponse({ description: 'Rate limited', type: ApiErrorDto })
@Public()
@Controller('admin/auth')
export class AdminAuthController {
	constructor(private readonly auth: AuthService) {}

	@ApiOperation({
		summary: 'Sign in to the admin dashboard',
		description:
			'Only accounts with the admin role get a session. The session always lasts 1 day. Refresh and sign out through `/auth/refresh` and `/auth/sign-out`.',
	})
	@ApiOkResponse({ type: SessionResponseDto })
	@ApiUnauthorizedResponse({
		description:
			'INVALID_CREDENTIALS, also returned for a correct password on a non-admin account',
		type: ApiErrorDto,
	})
	@ApiForbiddenResponse({
		description: 'EMAIL_NOT_VERIFIED or ACCOUNT_SUSPENDED',
		type: ApiErrorDto,
	})
	@Throttle({ default: { limit: 10, ttl: 60_000 } })
	@HttpCode(HttpStatus.OK)
	@Post('sign-in')
	signIn(
		@Body() dto: AdminSignInDto,
		@Session() context: SessionContext,
	): Promise<SessionResponseDto> {
		return this.auth.signInAdmin(dto, context);
	}
}
