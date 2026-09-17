import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from '../users/entities/user.entity';
import { SupportMessage } from './entities/support-message.entity';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';

@Module({
	imports: [TypeOrmModule.forFeature([SupportMessage, User])],
	controllers: [SupportController],
	providers: [SupportService],
})
export class SupportModule {}
