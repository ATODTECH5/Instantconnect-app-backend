import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { AuthenticatedUser } from '../../common/types/request';
import { authConfig } from '../../config/configuration';
import type { AccessTokenPayload } from '../token-payload';

/**
 * Deliberately stateless: no database read per request. A suspension or role
 * change therefore takes effect within the access token's lifetime rather than
 * instantly, which is the trade the short TTL is there to bound.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
	constructor(@Inject(authConfig.KEY) config: ConfigType<typeof authConfig>) {
		super({
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			ignoreExpiration: false,
			secretOrKey: config.accessSecret,
		});
	}

	validate(payload: AccessTokenPayload): AuthenticatedUser {
		return { id: payload.sub, email: payload.email, role: payload.role };
	}
}
