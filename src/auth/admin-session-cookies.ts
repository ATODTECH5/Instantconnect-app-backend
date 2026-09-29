import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';

import { authConfig } from '../config/configuration';
import type { IssuedTokens } from './dto/session-response.dto';

export const ADMIN_ACCESS_COOKIE = 'ic_admin_access';
export const ADMIN_REFRESH_COOKIE = 'ic_admin_refresh';

/**
 * The dashboard never sees a token: both live in httpOnly cookies. SameSite
 * strict is the CSRF defence, since the dashboard and the API are the same
 * site (localhost, or subdomains of one domain in production) while any other
 * site's request arrives without the cookies.
 */
@Injectable()
export class AdminSessionCookies {
	constructor(
		@Inject(authConfig.KEY)
		private readonly config: ConfigType<typeof authConfig>,
	) {}

	write(response: Response, tokens: IssuedTokens): void {
		response.cookie(ADMIN_ACCESS_COOKIE, tokens.accessToken, {
			...this.baseOptions(),
			maxAge: tokens.accessTokenExpiresIn * 1000,
		});
		response.cookie(ADMIN_REFRESH_COOKIE, tokens.refreshToken, {
			...this.baseOptions(),
			expires: tokens.refreshTokenExpiresAt,
		});
	}

	readRefreshToken(request: Request): string | undefined {
		const cookies = request.cookies as Record<string, string | undefined>;

		return cookies[ADMIN_REFRESH_COOKIE] || undefined;
	}

	clear(response: Response): void {
		response.clearCookie(ADMIN_ACCESS_COOKIE, this.baseOptions());
		response.clearCookie(ADMIN_REFRESH_COOKIE, this.baseOptions());
	}

	private baseOptions(): CookieOptions {
		return {
			httpOnly: true,
			secure: this.config.secureCookies,
			sameSite: 'strict',
			path: '/',
			domain: this.config.adminCookieDomain,
		};
	}
}
