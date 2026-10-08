import {
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
	Post,
	Query,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiCookieAuth,
	ApiForbiddenResponse,
	ApiNoContentResponse,
	ApiNotFoundResponse,
	ApiOkResponse,
	ApiOperation,
	ApiTags,
	ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiErrorDto } from '../common/dto/api-error.dto';
import { ADMIN_SESSION_AUTH } from '../docs/swagger';
import { UserRole } from '../users/entities/user-role.enum';
import {
	AdminUserReportPageDto,
	ListUserReportsQueryDto,
} from './dto/user-report.dto';
import { UserReportStatus } from './entities/user-report.entity';
import { ReportsService } from './reports.service';

@ApiTags('Admin Reports')
@ApiCookieAuth(ADMIN_SESSION_AUTH)
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED', type: ApiErrorDto })
@ApiForbiddenResponse({ description: 'FORBIDDEN', type: ApiErrorDto })
@Roles(UserRole.Admin)
@Controller('admin/user-reports')
export class AdminReportsController {
	constructor(private readonly reports: ReportsService) {}

	@ApiOperation({
		summary: 'Reports against members',
		description: 'Open reports oldest first; reviewed ones newest first.',
	})
	@ApiOkResponse({ type: AdminUserReportPageDto })
	@Get()
	list(
		@Query() query: ListUserReportsQueryDto,
	): Promise<AdminUserReportPageDto> {
		return this.reports.list(query);
	}

	@ApiOperation({ summary: 'Close a report with no action' })
	@ApiNoContentResponse()
	@ApiNotFoundResponse({ description: 'REPORT_NOT_FOUND', type: ApiErrorDto })
	@Post(':id/dismiss')
	@HttpCode(HttpStatus.NO_CONTENT)
	dismiss(
		@CurrentUser('id') adminId: string,
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<void> {
		return this.reports.review(adminId, id, UserReportStatus.Dismissed);
	}

	@ApiOperation({
		summary: 'Close a report as acted on',
		description:
			'Records that the safety team acted, for example by disabling the account from the Users page.',
	})
	@ApiNoContentResponse()
	@ApiNotFoundResponse({ description: 'REPORT_NOT_FOUND', type: ApiErrorDto })
	@Post(':id/resolve')
	@HttpCode(HttpStatus.NO_CONTENT)
	resolve(
		@CurrentUser('id') adminId: string,
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<void> {
		return this.reports.review(adminId, id, UserReportStatus.Resolved);
	}
}
