import { Controller, Get, VERSION_NEUTRAL, Version } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
	HealthCheck,
	HealthCheckResult,
	HealthCheckService,
	TypeOrmHealthIndicator,
} from '@nestjs/terminus';

import { Public } from '../common/decorators/public.decorator';

@ApiTags('Health')
@Controller('health')
export class HealthController {
	constructor(
		private readonly health: HealthCheckService,
		private readonly database: TypeOrmHealthIndicator,
	) {}

	/**
	 * Unversioned and unprefixed so load balancer and platform probes have one
	 * stable path that survives an API version bump.
	 */
	@ApiOperation({
		summary: 'Liveness probe',
		description:
			'Unprefixed and unversioned, so it survives an API version bump.',
	})
	@ApiOkResponse({ description: 'Every dependency reachable.' })
	@Public()
	@Version(VERSION_NEUTRAL)
	@Get()
	@HealthCheck()
	check(): Promise<HealthCheckResult> {
		return this.health.check([
			() => this.database.pingCheck('database', { timeout: 3_000 }),
		]);
	}
}
