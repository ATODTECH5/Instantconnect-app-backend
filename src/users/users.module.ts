import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ReferenceModule } from '../reference/reference.module';
import { StorageModule } from '../storage/storage.module';
import { AuthIdentity } from './entities/auth-identity.entity';
import { User } from './entities/user.entity';
import { UserPhoto } from './entities/user-photo.entity';
import { UserPhotosController } from './user-photos.controller';
import { UserPhotosService } from './user-photos.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([User, AuthIdentity, UserPhoto]),
		ReferenceModule,
		StorageModule,
	],
	controllers: [UsersController, UserPhotosController],
	providers: [UsersService, UserPhotosService],
	exports: [UsersService],
})
export class UsersModule {}
