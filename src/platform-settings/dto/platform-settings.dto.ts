import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	ArrayMaxSize,
	IsArray,
	IsBoolean,
	IsEmail,
	IsInt,
	IsOptional,
	IsString,
	Matches,
	Max,
	MaxLength,
	Min,
	MinLength,
} from 'class-validator';

import { MINIMUM_AGE } from '../../common/utils/age.util';

const MAXIMUM_MINIMUM_AGE = 100;
export const MAX_BLOCKED_ENTRIES = 300;
const MAX_ALERT_EMAILS = 10;
const HOSTNAME = /^(?=.{1,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/;

/** Trimmed, lower cased and de-duplicated, so the stored list is canonical. */
const canonicalList = Transform(({ value }: { value: unknown }) =>
	Array.isArray(value)
		? [
				...new Set(
					value
						.filter(
							(entry): entry is string =>
								typeof entry === 'string',
						)
						.map((entry) => entry.trim().toLowerCase())
						.filter(Boolean),
				),
			]
		: value,
);

/** "https://www.Bad.com/path" and "bad.com" both become "bad.com". */
const canonicalDomains = Transform(({ value }: { value: unknown }) =>
	Array.isArray(value)
		? [
				...new Set(
					value
						.filter(
							(entry): entry is string =>
								typeof entry === 'string',
						)
						.map(
							(entry) =>
								entry
									.trim()
									.toLowerCase()
									.replace(/^[a-z]+:\/\//, '')
									.replace(/^www\./, '')
									.split(/[/?#:]/)[0],
						)
						.filter(Boolean),
				),
			]
		: value,
);

export class PlatformSettingsDto {
	@ApiProperty({
		description:
			'Every route except the admin dashboard and health answers 503 MAINTENANCE_MODE.',
	})
	maintenanceMode!: boolean;

	@ApiProperty({
		description: 'Off: sign-up answers 403 REGISTRATION_CLOSED.',
	})
	allowNewRegistrations!: boolean;

	@ApiProperty({
		minimum: MINIMUM_AGE,
		maximum: MAXIMUM_MINIMUM_AGE,
		description: `Can only raise the legal floor of ${MINIMUM_AGE}.`,
	})
	minimumAge!: number;

	@ApiProperty({
		description:
			'On: joining an event answers 403 KYC_REQUIRED until verified.',
	})
	kycRequiredToJoinEvents!: boolean;

	@ApiProperty({
		description:
			'On: creating an event answers 403 KYC_REQUIRED until verified.',
	})
	kycRequiredToCreateEvents!: boolean;

	@ApiProperty({
		description:
			'Off: creating an event with a price answers 403 PAID_EVENTS_DISABLED. Existing paid events are untouched.',
	})
	allowPaidEvents!: boolean;

	@ApiProperty({ description: 'Off: no push for new messages.' })
	pushMessages!: boolean;

	@ApiProperty({
		description: 'Off: no push for connection requests or acceptances.',
	})
	pushConnections!: boolean;

	@ApiProperty({ description: 'Off: no push for event invites or joins.' })
	pushEvents!: boolean;

	@ApiProperty({
		description:
			'Off: no push for meetup proposals, acceptances, declines or cancellations. Safety checks always push.',
	})
	pushMeetups!: boolean;

	@ApiProperty({ description: 'Off: no push for KYC decisions.' })
	pushKyc!: boolean;

	@ApiProperty({
		description: 'Off: no push for community invites, comments or replies.',
	})
	pushCommunities!: boolean;

	@ApiProperty({
		description:
			'On: every address in adminAlertEmails is emailed when a member submits KYC.',
	})
	kycSubmittedAlert!: boolean;

	@ApiProperty({ type: [String], example: ['ops@instantconnect.app'] })
	adminAlertEmails!: string[];

	@ApiProperty({
		description:
			'On: lockoutMaxAttempts wrong passwords in a row lock the account for lockoutMinutes (403 ACCOUNT_LOCKED).',
	})
	lockoutEnabled!: boolean;

	@ApiProperty({ minimum: 3, maximum: 20 })
	lockoutMaxAttempts!: number;

	@ApiProperty({ minimum: 1, maximum: 1440 })
	lockoutMinutes!: number;

	@ApiProperty({
		minimum: 1,
		maximum: 365,
		description:
			'How long "keep me signed in" lasts. Applies to sessions started after the change.',
	})
	keepSignedInDays!: number;

	@ApiProperty({
		type: [String],
		description:
			'Whole words refused (400 BLOCKED_CONTENT) in messages, event text, profiles and community posts.',
	})
	blockedWords!: string[];

	@ApiProperty({
		type: [String],
		description:
			'Hostnames refused in the same places; subdomains included.',
	})
	blockedDomains!: string[];

	@ApiProperty({ format: 'date-time' })
	updatedAt!: string;

	@ApiProperty({ nullable: true, type: String, example: 'John Wick' })
	updatedByName!: string | null;
}

export class UpdatePlatformSettingsDto {
	@ApiPropertyOptional()
	@IsBoolean()
	@IsOptional()
	maintenanceMode?: boolean;

	@ApiPropertyOptional()
	@IsBoolean()
	@IsOptional()
	allowNewRegistrations?: boolean;

	@ApiPropertyOptional({ minimum: MINIMUM_AGE, maximum: MAXIMUM_MINIMUM_AGE })
	@IsInt()
	@Min(MINIMUM_AGE, {
		message: `Minimum age cannot be below ${MINIMUM_AGE}`,
	})
	@Max(MAXIMUM_MINIMUM_AGE)
	@IsOptional()
	minimumAge?: number;

	@ApiPropertyOptional()
	@IsBoolean()
	@IsOptional()
	kycRequiredToJoinEvents?: boolean;

	@ApiPropertyOptional()
	@IsBoolean()
	@IsOptional()
	kycRequiredToCreateEvents?: boolean;

	@ApiPropertyOptional()
	@IsBoolean()
	@IsOptional()
	allowPaidEvents?: boolean;

	@ApiPropertyOptional()
	@IsBoolean()
	@IsOptional()
	pushMessages?: boolean;

	@ApiPropertyOptional()
	@IsBoolean()
	@IsOptional()
	pushConnections?: boolean;

	@ApiPropertyOptional()
	@IsBoolean()
	@IsOptional()
	pushEvents?: boolean;

	@ApiPropertyOptional()
	@IsBoolean()
	@IsOptional()
	pushMeetups?: boolean;

	@ApiPropertyOptional()
	@IsBoolean()
	@IsOptional()
	pushKyc?: boolean;

	@ApiPropertyOptional()
	@IsBoolean()
	@IsOptional()
	pushCommunities?: boolean;

	@ApiPropertyOptional()
	@IsBoolean()
	@IsOptional()
	kycSubmittedAlert?: boolean;

	@ApiPropertyOptional({ type: [String], maxItems: MAX_ALERT_EMAILS })
	@canonicalList
	@IsArray()
	@ArrayMaxSize(MAX_ALERT_EMAILS)
	@IsEmail(
		{},
		{
			each: true,
			message: 'Each alert recipient must be an email address',
		},
	)
	@IsOptional()
	adminAlertEmails?: string[];

	@ApiPropertyOptional()
	@IsBoolean()
	@IsOptional()
	lockoutEnabled?: boolean;

	@ApiPropertyOptional({ minimum: 3, maximum: 20 })
	@IsInt()
	@Min(3)
	@Max(20)
	@IsOptional()
	lockoutMaxAttempts?: number;

	@ApiPropertyOptional({ minimum: 1, maximum: 1440 })
	@IsInt()
	@Min(1)
	@Max(1440)
	@IsOptional()
	lockoutMinutes?: number;

	@ApiPropertyOptional({ minimum: 1, maximum: 365 })
	@IsInt()
	@Min(1)
	@Max(365)
	@IsOptional()
	keepSignedInDays?: number;

	@ApiPropertyOptional({ type: [String], maxItems: MAX_BLOCKED_ENTRIES })
	@canonicalList
	@IsArray()
	@ArrayMaxSize(MAX_BLOCKED_ENTRIES)
	@IsString({ each: true })
	@MinLength(2, {
		each: true,
		message: 'Blocked words need at least 2 letters',
	})
	@MaxLength(64, { each: true })
	@IsOptional()
	blockedWords?: string[];

	@ApiPropertyOptional({ type: [String], maxItems: MAX_BLOCKED_ENTRIES })
	@canonicalDomains
	@IsArray()
	@ArrayMaxSize(MAX_BLOCKED_ENTRIES)
	@Matches(HOSTNAME, {
		each: true,
		message: 'Each blocked domain must look like example.com',
	})
	@IsOptional()
	blockedDomains?: string[];
}
