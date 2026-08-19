import type { Request } from 'express';

import type { UserRole } from '../../users/entities/user-role.enum';

export type AuthenticatedUser = {
	id: string;
	email: string;
	role: UserRole;
};

export type RequestWithId = Request & { id?: string };

export type AuthenticatedRequest = RequestWithId & { user: AuthenticatedUser };
