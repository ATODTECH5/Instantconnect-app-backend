import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Category } from './entities/category.entity';
import { Hobby } from './entities/hobby.entity';
import { Occupation } from './entities/occupation.entity';
import { ReferenceController } from './reference.controller';
import { ReferenceService } from './reference.service';

@Module({
	imports: [TypeOrmModule.forFeature([Category, Occupation, Hobby])],
	controllers: [ReferenceController],
	providers: [ReferenceService],
	exports: [ReferenceService],
})
export class ReferenceModule {}
