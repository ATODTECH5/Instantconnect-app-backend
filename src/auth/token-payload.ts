import type { UserRole } from '../users/entities/user-role.enum';

export type AccessTokenPayload = {
	sub: string;
	email: string;
	role: UserRole;
};

/**
 * Signed with its own secret so an access token can never be presented where a
 * reset grant is expected, and vice versa.
 */
export type PasswordResetPayload = {
	sub: string;
	codeId: string;
};

export type SessionContext = {
	keepSignedIn: boolean;
	userAgent: string | null;
	ipAddress: string | null;
};
