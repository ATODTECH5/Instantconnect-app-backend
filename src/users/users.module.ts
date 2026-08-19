import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { InterestsModule } from '../interests/interests.module';
import { AuthIdentity } from './entities/auth-identity.entity';
import { User } from './entities/user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
	imports: [TypeOrmModule.forFeature([User, AuthIdentity]), InterestsModule],
	controllers: [UsersController],
	providers: [UsersService],
	exports: [UsersService],
})
export class UsersModule {}
