import { SetMetadata } from '@nestjs/common';

export const ALLOW_DURING_MAINTENANCE_KEY = 'allowDuringMaintenance';

/** For the few public routes the dashboard and probes need while maintenance is on. */
export const AllowDuringMaintenance = () =>
	SetMetadata(ALLOW_DURING_MAINTENANCE_KEY, true);
