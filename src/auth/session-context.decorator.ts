import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { RequestWithId } from '../common/types/request';
import type { SessionContext } from './token-payload';

/** Stamps each refresh token with the device it was issued to, for the sessions list. */
export const Session = createParamDecorator(
	(_data: unknown, context: ExecutionContext): SessionContext => {
		const request = context.switchToHttp().getRequest<RequestWithId>();
		const body = request.body as { keepSignedIn?: boolean } | undefined;

		return {
			keepSignedIn: body?.keepSignedIn === true,
			userAgent: request.headers['user-agent']?.slice(0, 255) ?? null,
			ipAddress: request.ip ?? null,
		};
	},
);
