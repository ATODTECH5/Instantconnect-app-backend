import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
	PlatformSettingsDto,
	UpdatePlatformSettingsDto,
} from './dto/platform-settings.dto';
import {
	PLATFORM_SETTINGS_ROW_ID,
	PlatformSettings,
} from './entities/platform-settings.entity';

/**
 * The maintenance guard reads this on every request. A short cache keeps that
 * off the database; another instance sees a change within this window.
 */
const CACHE_TTL_MS = 15_000;

@Injectable()
export class PlatformSettingsService {
	private cached: { value: PlatformSettings; expiresAt: number } | null =
		null;

	constructor(
		@InjectRepository(PlatformSettings)
		private readonly settings: Repository<PlatformSettings>,
	) {}

	async current(): Promise<PlatformSettings> {
		if (this.cached && this.cached.expiresAt > Date.now()) {
			return this.cached.value;
		}

		return this.remember(await this.load());
	}

	async describe(): Promise<PlatformSettingsDto> {
		return toDto(await this.load());
	}

	async update(
		adminId: string,
		changes: UpdatePlatformSettingsDto,
	): Promise<PlatformSettingsDto> {
		await this.settings.update(PLATFORM_SETTINGS_ROW_ID, {
			...changes,
			updatedById: adminId,
		});

		const saved = await this.load();
		this.remember(saved);

		return toDto(saved);
	}

	/** The migration inserts the row, so a missing one is a broken database. */
	private load(): Promise<PlatformSettings> {
		return this.settings.findOneOrFail({
			where: { id: PLATFORM_SETTINGS_ROW_ID },
			relations: { updatedBy: true },
		});
	}

	private remember(value: PlatformSettings): PlatformSettings {
		this.cached = { value, expiresAt: Date.now() + CACHE_TTL_MS };

		return value;
	}
}

function toDto(row: PlatformSettings): PlatformSettingsDto {
	return {
		maintenanceMode: row.maintenanceMode,
		allowNewRegistrations: row.allowNewRegistrations,
		minimumAge: row.minimumAge,
		kycRequiredToJoinEvents: row.kycRequiredToJoinEvents,
		kycRequiredToCreateEvents: row.kycRequiredToCreateEvents,
		allowPaidEvents: row.allowPaidEvents,
		updatedAt: row.updatedAt.toISOString(),
		updatedByName: row.updatedBy?.fullName ?? null,
	};
}
