import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AuthenticatedUser } from '../../common/types/request';
import { UserRole } from '../../users/entities/user-role.enum';
import { RolesGuard } from './roles.guard';

const contextFor = (user: AuthenticatedUser | undefined): ExecutionContext =>
	({
		getHandler: () => undefined,
		getClass: () => undefined,
		switchToHttp: () => ({ getRequest: () => ({ user }) }),
	}) as unknown as ExecutionContext;

const ADMIN: AuthenticatedUser = {
	id: 'a',
	email: 'admin@example.com',
	role: UserRole.Admin,
};

const MEMBER: AuthenticatedUser = {
	id: 'b',
	email: 'member@example.com',
	role: UserRole.User,
};

describe('RolesGuard', () => {
	let reflector: Reflector;
	let guard: RolesGuard;

	beforeEach(() => {
		reflector = new Reflector();
		guard = new RolesGuard(reflector);
	});

	const requireRoles = (roles: UserRole[] | undefined) =>
		jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(roles);

	it('allows a route that declares no roles', () => {
		requireRoles(undefined);

		expect(guard.canActivate(contextFor(MEMBER))).toBe(true);
	});

	it('allows a route whose role list is empty', () => {
		requireRoles([]);

		expect(guard.canActivate(contextFor(MEMBER))).toBe(true);
	});

	it('allows a user holding the required role', () => {
		requireRoles([UserRole.Admin]);

		expect(guard.canActivate(contextFor(ADMIN))).toBe(true);
	});

	it('refuses a user without the required role', () => {
		requireRoles([UserRole.Admin]);

		expect(() => guard.canActivate(contextFor(MEMBER))).toThrow(
			ForbiddenException,
		);
	});

	it('refuses when the request carries no user at all', () => {
		requireRoles([UserRole.Admin]);

		expect(() => guard.canActivate(contextFor(undefined))).toThrow(
			ForbiddenException,
		);
	});
});
