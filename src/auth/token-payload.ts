import type { UserRole } from '../users/entities/user-role.enum';

export type AccessTokenPayload = {
	sub: string;
	email: string;
	role: UserRole;
};

export type PasswordResetPayload = {
	sub: string;
	codeId: string;
};

export type SessionContext = {
	keepSignedIn: boolean;
	userAgent: string | null;
	ipAddress: string | null;
};
