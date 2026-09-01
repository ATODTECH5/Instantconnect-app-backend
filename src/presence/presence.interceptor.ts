import {
	CallHandler,
	ExecutionContext,
	Injectable,
	NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';

import type { MaybeAuthenticatedRequest } from '../common/types/request';
import { PresenceService } from './presence.service';

/**
 * Marks the account behind an authenticated request as active. Global rather
 * than per controller so a new route cannot forget it, and it runs after the
 * auth guard, which is what puts `user` on the request. Public routes have no
 * `user` and record nothing.
 */
@Injectable()
export class PresenceInterceptor implements NestInterceptor {
	constructor(private readonly presence: PresenceService) {}

	intercept(
		context: ExecutionContext,
		next: CallHandler,
	): Observable<unknown> {
		if (context.getType() === 'http') {
			const request = context
				.switchToHttp()
				.getRequest<MaybeAuthenticatedRequest>();

			if (request.user) {
				this.presence.touch(request.user.id);
			}
		}

		return next.handle();
	}
}
