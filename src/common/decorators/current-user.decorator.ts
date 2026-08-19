import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { AuthenticatedRequest, AuthenticatedUser } from '../types/request';

export const CurrentUser = createParamDecorator(
	(field: keyof AuthenticatedUser | undefined, context: ExecutionContext) => {
		const request = context
			.switchToHttp()
			.getRequest<AuthenticatedRequest>();

		return field ? request.user[field] : request.user;
	},
);
