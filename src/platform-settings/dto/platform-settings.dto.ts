import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

import { MINIMUM_AGE } from '../../common/utils/age.util';

const MAXIMUM_MINIMUM_AGE = 100;

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
}
