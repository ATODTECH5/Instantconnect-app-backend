import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { AuthenticatedUser } from '../../common/types/request';
import { authConfig } from '../../config/configuration';
import { ADMIN_ACCESS_COOKIE } from '../admin-session-cookies';
import type { AccessTokenPayload } from '../token-payload';

const fromAdminAccessCookie = (request: Request): string | null => {
	const cookies = request.cookies as Record<string, string | undefined>;

	return cookies?.[ADMIN_ACCESS_COOKIE] ?? null;
};

/**
 * Deliberately stateless: no database read per request. A suspension or role
 * change therefore takes effect within the access token's lifetime rather than
 * instantly, which is the trade the short TTL is there to bound.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
	constructor(@Inject(authConfig.KEY) config: ConfigType<typeof authConfig>) {
		super({
			// The app sends a bearer header; the admin dashboard only has its cookie.
			jwtFromRequest: ExtractJwt.fromExtractors([
				ExtractJwt.fromAuthHeaderAsBearerToken(),
				fromAdminAccessCookie,
			]),
			ignoreExpiration: false,
			secretOrKey: config.accessSecret,
		});
	}

	validate(payload: AccessTokenPayload): AuthenticatedUser {
		return { id: payload.sub, email: payload.email, role: payload.role };
	}
}
