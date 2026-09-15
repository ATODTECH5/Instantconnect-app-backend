import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

import type { NotificationPreference } from '../entities/notification-preference.entity';

const FIELDS = [
	'pushEnabled',
	'pushEventReminders',
	'pushNewConnections',
	'pushMessages',
	'pushCommunityUpdates',
	'emailEnabled',
	'emailEventInvites',
	'emailWeeklyDigest',
	'emailPromotions',
	'inAppEnabled',
] as const;

export type NotificationPreferenceField = (typeof FIELDS)[number];

export class NotificationPreferencesResponseDto {
	@ApiProperty({ example: true }) pushEnabled: boolean;
	@ApiProperty({ example: true }) pushEventReminders: boolean;
	@ApiProperty({ example: true }) pushNewConnections: boolean;
	@ApiProperty({ example: true }) pushMessages: boolean;
	@ApiProperty({ example: true }) pushCommunityUpdates: boolean;
	@ApiProperty({ example: true }) emailEnabled: boolean;
	@ApiProperty({ example: true }) emailEventInvites: boolean;
	@ApiProperty({ example: false }) emailWeeklyDigest: boolean;
	@ApiProperty({ example: false }) emailPromotions: boolean;
	@ApiProperty({ example: true }) inAppEnabled: boolean;

	constructor(preference: NotificationPreference) {
		for (const field of FIELDS) this[field] = preference[field];
	}
}

/** Only the keys sent are changed, like `PATCH /users/me/profile`. */
export class UpdateNotificationPreferencesDto {
	@ApiPropertyOptional() @IsOptional() @IsBoolean() pushEnabled?: boolean;
	@ApiPropertyOptional()
	@IsOptional()
	@IsBoolean()
	pushEventReminders?: boolean;
	@ApiPropertyOptional()
	@IsOptional()
	@IsBoolean()
	pushNewConnections?: boolean;
	@ApiPropertyOptional() @IsOptional() @IsBoolean() pushMessages?: boolean;
	@ApiPropertyOptional()
	@IsOptional()
	@IsBoolean()
	pushCommunityUpdates?: boolean;
	@ApiPropertyOptional() @IsOptional() @IsBoolean() emailEnabled?: boolean;
	@ApiPropertyOptional()
	@IsOptional()
	@IsBoolean()
	emailEventInvites?: boolean;
	@ApiPropertyOptional()
	@IsOptional()
	@IsBoolean()
	emailWeeklyDigest?: boolean;
	@ApiPropertyOptional() @IsOptional() @IsBoolean() emailPromotions?: boolean;
	@ApiPropertyOptional() @IsOptional() @IsBoolean() inAppEnabled?: boolean;
}
