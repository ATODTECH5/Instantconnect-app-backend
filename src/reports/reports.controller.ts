import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
	ApiBadRequestResponse,
	ApiBearerAuth,
	ApiNoContentResponse,
	ApiNotFoundResponse,
	ApiOperation,
	ApiTags,
	ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiErrorDto } from '../common/dto/api-error.dto';
import { CreateUserReportDto } from './dto/user-report.dto';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED', type: ApiErrorDto })
@Controller('reports')
export class ReportsController {
	constructor(private readonly reports: ReportsService) {}

	@ApiOperation({
		summary: 'Report a member',
		description:
			'Anonymous to the reported member and reviewed by the safety team. Reporting the same member again while a report is open changes nothing.',
	})
	@ApiNoContentResponse()
	@ApiBadRequestResponse({
		description: 'CANNOT_REPORT_SELF',
		type: ApiErrorDto,
	})
	@ApiNotFoundResponse({ description: 'USER_NOT_FOUND', type: ApiErrorDto })
	@Post('users')
	@HttpCode(HttpStatus.NO_CONTENT)
	reportUser(
		@CurrentUser('id') reporterId: string,
		@Body() dto: CreateUserReportDto,
	): Promise<void> {
		return this.reports.reportUser(reporterId, dto);
	}
}
