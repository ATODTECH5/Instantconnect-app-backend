import { Module } from '@nestjs/common';

import { StorageModule } from '../storage/storage.module';
import { SupportModule } from '../support/support.module';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

@Module({
	imports: [StorageModule, SupportModule],
	controllers: [AdminUsersController],
	providers: [AdminUsersService],
})
export class AdminUsersModule {}
