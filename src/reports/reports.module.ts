import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from '../users/entities/user.entity';
import { AdminReportsController } from './admin-reports.controller';
import { UserReport } from './entities/user-report.entity';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
	imports: [TypeOrmModule.forFeature([UserReport, User])],
	controllers: [ReportsController, AdminReportsController],
	providers: [ReportsService],
})
export class ReportsModule {}
