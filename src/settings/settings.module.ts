import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { User } from '../users/entities/user.entity';
import { UsersModule } from '../users/users.module';
import { NotificationPreference } from './entities/notification-preference.entity';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([User, NotificationPreference]),
		UsersModule,
		AuthModule,
		MailModule,
	],
	controllers: [SettingsController],
	providers: [SettingsService],
})
export class SettingsModule {}
