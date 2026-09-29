import { Controller, Get, Query } from '@nestjs/common';
import {
	ApiForbiddenResponse,
	ApiOkResponse,
	ApiOperation,
	ApiTags,
	ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { Roles } from '../common/decorators/roles.decorator';
import { ApiErrorDto } from '../common/dto/api-error.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { UserRole } from '../users/entities/user-role.enum';
import { AdminDashboardService } from './admin-dashboard.service';
import { DashboardActivityPageDto } from './dto/dashboard-activity.dto';
import { DashboardStatsDto } from './dto/dashboard-stats.dto';
import { EventsByCategoryDto } from './dto/events-by-category.dto';
import { UserGrowthDto, UserGrowthQueryDto } from './dto/user-growth.dto';

@ApiTags('Admin Dashboard')
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED', type: ApiErrorDto })
@ApiForbiddenResponse({ description: 'FORBIDDEN', type: ApiErrorDto })
@Roles(UserRole.Admin)
@Controller('admin/dashboard')
export class AdminDashboardController {
	constructor(private readonly dashboard: AdminDashboardService) {}

	@ApiOperation({ summary: 'Headline numbers for the overview cards' })
	@ApiOkResponse({ type: DashboardStatsDto })
	@Get('stats')
	getStats(): Promise<DashboardStatsDto> {
		return this.dashboard.getStats();
	}

	@ApiOperation({ summary: 'New member sign ups per calendar month' })
	@ApiOkResponse({ type: UserGrowthDto })
	@Get('user-growth')
	getUserGrowth(@Query() query: UserGrowthQueryDto): Promise<UserGrowthDto> {
		return this.dashboard.getUserGrowth(query);
	}

	@ApiOperation({ summary: 'Events that have not ended, by category' })
	@ApiOkResponse({ type: EventsByCategoryDto })
	@Get('events-by-category')
	getEventsByCategory(): Promise<EventsByCategoryDto> {
		return this.dashboard.getEventsByCategory();
	}

	@ApiOperation({
		summary: 'Recent platform activity',
		description:
			'Registrations, events created and KYC submissions, newest first.',
	})
	@ApiOkResponse({ type: DashboardActivityPageDto })
	@Get('activity')
	getActivity(
		@Query() query: PaginationQueryDto,
	): Promise<DashboardActivityPageDto> {
		return this.dashboard.getActivity(query);
	}
}
