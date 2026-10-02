import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, Matches, MaxLength } from 'class-validator';

import { PushPlatform } from '../entities/push-token.entity';

/**
 * Only Expo tokens are accepted. The dispatcher speaks Expo's push API, so a
 * raw APNs or FCM token would be stored and then rejected on every send.
 */
const EXPO_TOKEN = /^Expo(nent)?PushToken\[.+\]$/;

export class RegisterPushTokenDto {
	@ApiProperty({ example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })
	@IsString()
	@MaxLength(255)
	@Matches(EXPO_TOKEN, { message: 'token must be an Expo push token' })
	token!: string;

	@ApiProperty({ enum: PushPlatform, enumName: 'PushPlatform' })
	@IsEnum(PushPlatform)
	platform!: PushPlatform;
}

export class RemovePushTokenDto {
	@ApiProperty({ example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })
	@IsString()
	@MaxLength(255)
	token!: string;
}
