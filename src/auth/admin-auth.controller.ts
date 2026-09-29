import {
	Body,
	Controller,
	HttpCode,
	HttpStatus,
	Post,
	Req,
	Res,
	UnauthorizedException,
} from '@nestjs/common';
import {
	ApiBadRequestResponse,
	ApiCookieAuth,
	ApiForbiddenResponse,
	ApiNoContentResponse,
	ApiOkResponse,
	ApiOperation,
	ApiTags,
	ApiTooManyRequestsResponse,
	ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { ApiErrorDto } from '../common/dto/api-error.dto';
import { Public } from '../common/decorators/public.decorator';
import { ADMIN_SESSION_AUTH } from '../docs/swagger';
import { AdminSessionCookies } from './admin-session-cookies';
import { AdminSignInDto } from './dto/admin-sign-in.dto';
import {
	AdminRefreshResponseDto,
	AdminSessionResponseDto,
} from './dto/admin-session-response.dto';
import { AuthService } from './auth.service';
import { Session } from './session-context.decorator';
import type { SessionContext } from './token-payload';

@ApiTags('Admin Auth')
@ApiBadRequestResponse({ description: 'VALIDATION_FAILED', type: ApiErrorDto })
@ApiTooManyRequestsResponse({ description: 'Rate limited', type: ApiErrorDto })
@Public()
@Controller('admin/auth')
export class AdminAuthController {
	constructor(
		private readonly auth: AuthService,
		private readonly cookies: AdminSessionCookies,
	) {}

	@ApiOperation({
		summary: 'Sign in to the admin dashboard',
		description:
			'Only accounts with the admin role get a session. The session lasts 1 day and is set as the httpOnly cookies `ic_admin_access` and `ic_admin_refresh`; send requests with credentials included.',
	})
	@ApiOkResponse({ type: AdminSessionResponseDto })
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
	async signIn(
		@Body() dto: AdminSignInDto,
		@Session() context: SessionContext,
		@Res({ passthrough: true }) response: Response,
	): Promise<AdminSessionResponseDto> {
		const { tokens, user } = await this.auth.signInAdmin(dto, context);

		this.cookies.write(response, tokens);

		return new AdminSessionResponseDto(tokens.accessTokenExpiresIn, user);
	}

	@ApiOperation({
		summary: 'Renew the admin session from its refresh cookie',
		description:
			'Rotates both cookies. A missing, expired or reused refresh cookie clears the session.',
	})
	@ApiOkResponse({ type: AdminRefreshResponseDto })
	@ApiUnauthorizedResponse({
		description: 'INVALID_REFRESH_TOKEN',
		type: ApiErrorDto,
	})
	@HttpCode(HttpStatus.OK)
	@ApiCookieAuth(ADMIN_SESSION_AUTH)
	@Post('refresh')
	async refresh(
		@Req() request: Request,
		@Session() context: SessionContext,
		@Res({ passthrough: true }) response: Response,
	): Promise<AdminRefreshResponseDto> {
		const refreshToken = this.cookies.readRefreshToken(request);

		try {
			if (!refreshToken) {
				throw new UnauthorizedException({
					code: 'INVALID_REFRESH_TOKEN',
					message: 'Your session has ended. Sign in again.',
				});
			}

			const tokens = await this.auth.rotateSession(refreshToken, context);

			this.cookies.write(response, tokens);

			return new AdminRefreshResponseDto(tokens.accessTokenExpiresIn);
		} catch (error) {
			// A dead session must not leave cookies behind, or the dashboard's route
			// guard would keep treating the browser as signed in.
			this.cookies.clear(response);
			throw error;
		}
	}

	@ApiOperation({ summary: 'Sign out of the admin dashboard' })
	@ApiNoContentResponse({
		description: 'Always, and the cookies are cleared either way.',
	})
	@HttpCode(HttpStatus.NO_CONTENT)
	@ApiCookieAuth(ADMIN_SESSION_AUTH)
	@Post('sign-out')
	async signOut(
		@Req() request: Request,
		@Res({ passthrough: true }) response: Response,
	): Promise<void> {
		const refreshToken = this.cookies.readRefreshToken(request);

		if (refreshToken) await this.auth.signOut(refreshToken);

		this.cookies.clear(response);
	}
}
