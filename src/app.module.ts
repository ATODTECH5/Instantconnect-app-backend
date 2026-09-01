import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AuthModule } from './auth/auth.module';
import { ConnectionsModule } from './connections/connections.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingModule } from './common/logging/logging.module';
import { configurations, throttleConfig } from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { DiscoveryModule } from './discovery/discovery.module';
import { HealthModule } from './health/health.module';
import { MailModule } from './mail/mail.module';
import { PresenceInterceptor } from './presence/presence.interceptor';
import { PresenceModule } from './presence/presence.module';
import { ReferenceModule } from './reference/reference.module';
import { StorageModule } from './storage/storage.module';
import { UsersModule } from './users/users.module';

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			cache: true,
			load: configurations,
		}),
		LoggingModule,
		DatabaseModule,
		ThrottlerModule.forRootAsync({
			inject: [throttleConfig.KEY],
			useFactory: (config: ConfigType<typeof throttleConfig>) => ({
				throttlers: [
					{ ttl: config.ttlSeconds * 1000, limit: config.limit },
				],
			}),
		}),
		MailModule,
		StorageModule,
		ReferenceModule,
		UsersModule,
		AuthModule,
		ConnectionsModule,
		DiscoveryModule,
		PresenceModule,
		HealthModule,
	],
	providers: [
		// Order matters: rate limiting runs before authentication so an
		// unauthenticated flood is rejected without touching the database.
		{ provide: APP_GUARD, useClass: ThrottlerGuard },
		{ provide: APP_GUARD, useClass: JwtAuthGuard },
		{ provide: APP_GUARD, useClass: RolesGuard },
		{ provide: APP_FILTER, useClass: AllExceptionsFilter },
		// Interceptors run after guards, which is what puts `user` on the request.
		{ provide: APP_INTERCEPTOR, useClass: PresenceInterceptor },
	],
})
export class AppModule {}
