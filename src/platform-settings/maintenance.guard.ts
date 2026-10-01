import {
	CanActivate,
	ExecutionContext,
	Injectable,
	ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ALLOW_DURING_MAINTENANCE_KEY } from '../common/decorators/allow-during-maintenance.decorator';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import type { MaybeAuthenticatedRequest } from '../common/types/request';
import { UserRole } from '../users/entities/user-role.enum';
import { PlatformSettingsService } from './platform-settings.service';

/**
 * Runs after authentication so an admin is recognised: the dashboard has to
 * keep working, or nobody could switch maintenance off again.
 */
@Injectable()
export class MaintenanceGuard implements CanActivate {
	constructor(
		private readonly reflector: Reflector,
		private readonly settings: PlatformSettingsService,
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		if (context.getType() !== 'http') return true;

		const targets = [context.getHandler(), context.getClass()];

		if (
			this.reflector.getAllAndOverride<boolean>(
				ALLOW_DURING_MAINTENANCE_KEY,
				targets,
			)
		) {
			return true;
		}

		const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(
			ROLES_KEY,
			targets,
		);
		if (roles?.includes(UserRole.Admin)) return true;

		const { user } = context
			.switchToHttp()
			.getRequest<MaybeAuthenticatedRequest>();
		if (user?.role === UserRole.Admin) return true;

		if (!(await this.settings.current()).maintenanceMode) return true;

		throw new ServiceUnavailableException({
			code: 'MAINTENANCE_MODE',
			message:
				'Instant Connect is down for maintenance. Please try again shortly.',
		});
	}
}
