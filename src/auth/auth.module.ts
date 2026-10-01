import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MailModule } from '../mail/mail.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { UsersModule } from '../users/users.module';
import { authConfig } from '../config/configuration';
import { AdminAuthController } from './admin-auth.controller';
import { AdminSessionCookies } from './admin-session-cookies';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { VerificationCode } from './entities/verification-code.entity';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokensService } from './tokens.service';
import { VerificationService } from './verification.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([RefreshToken, VerificationCode]),
		PassportModule,
		JwtModule.registerAsync({
			inject: [authConfig.KEY],
			useFactory: (config: ConfigType<typeof authConfig>) => ({
				secret: config.accessSecret,
				signOptions: { expiresIn: config.accessTtl },
			}),
		}),
		UsersModule,
		MailModule,
		ReferralsModule,
		PlatformSettingsModule,
	],
	controllers: [AuthController, AdminAuthController],
	providers: [
		AuthService,
		TokensService,
		VerificationService,
		JwtStrategy,
		AdminSessionCookies,
	],
	// Settings reuses the code issuing and the code table for its own purposes.
	exports: [VerificationService],
})
export class AuthModule {}
