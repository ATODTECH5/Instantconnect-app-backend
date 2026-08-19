import {
	ExecutionContext,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Observable } from 'rxjs';

import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

/** Applied globally, so a new route is authenticated unless it opts out with `@Public()`. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
	constructor(private readonly reflector: Reflector) {
		super();
	}

	canActivate(
		context: ExecutionContext,
	): boolean | Promise<boolean> | Observable<boolean> {
		const isPublic = this.reflector.getAllAndOverride<boolean>(
			IS_PUBLIC_KEY,
			[context.getHandler(), context.getClass()],
		);

		return isPublic ? true : super.canActivate(context);
	}

	handleRequest<TUser>(error: unknown, user: TUser): TUser {
		if (error || !user) {
			throw new UnauthorizedException({
				code: 'UNAUTHENTICATED',
				message: 'Sign in to continue.',
			});
		}

		return user;
	}
}
