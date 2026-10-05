import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
	Patch,
	Post,
	Query,
	StreamableFile,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiCookieAuth,
	ApiForbiddenResponse,
	ApiNotFoundResponse,
	ApiOkResponse,
	ApiConflictResponse,
	ApiNoContentResponse,
	ApiOperation,
	ApiProduces,
	ApiTags,
	ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiErrorDto } from '../common/dto/api-error.dto';
import { ADMIN_SESSION_AUTH } from '../docs/swagger';
import {
	AdminPaymentPageDto,
	AdminPlanDto,
	AdminSubscriberPageDto,
	AdminSubscriptionDetailDto,
	AdminSubscriptionFiltersDto,
	AdminSubscriptionStatsDto,
	ListAdminPaymentsQueryDto,
	ListAdminSubscriptionsQueryDto,
	PaymentSettingsDto,
	UpdatePlanDto,
} from '../subscriptions/dto/subscription.dto';
import { UserRole } from '../users/entities/user-role.enum';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import {
	AdminSubscriptionsService,
	MAX_EXPORT_ROWS,
} from './admin-subscriptions.service';

@ApiTags('Admin Subscriptions')
@ApiCookieAuth(ADMIN_SESSION_AUTH)
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED', type: ApiErrorDto })
@ApiForbiddenResponse({ description: 'FORBIDDEN', type: ApiErrorDto })
@Roles(UserRole.Admin)
@Controller('admin/subscriptions')
export class AdminSubscriptionsController {
	constructor(
		private readonly subscriptions: AdminSubscriptionsService,
		private readonly billing: SubscriptionsService,
	) {}

	@ApiOperation({ summary: 'Totals for the stat cards' })
	@ApiOkResponse({ type: AdminSubscriptionStatsDto })
	@Get('stats')
	stats(): Promise<AdminSubscriptionStatsDto> {
		return this.subscriptions.stats();
	}

	@ApiOperation({
		summary: 'Subscribers',
		description:
			'Live subscriptions by default; pass a status to see others. Newest first.',
	})
	@ApiOkResponse({ type: AdminSubscriberPageDto })
	@Get()
	list(
		@Query() query: ListAdminSubscriptionsQueryDto,
	): Promise<AdminSubscriberPageDto> {
		return this.subscriptions.subscribers(query);
	}

	@ApiOperation({ summary: 'Every charge, newest first' })
	@ApiOkResponse({ type: AdminPaymentPageDto })
	@Get('payments')
	payments(
		@Query() query: ListAdminPaymentsQueryDto,
	): Promise<AdminPaymentPageDto> {
		return this.subscriptions.payments(query);
	}

	@ApiOperation({ summary: 'Plans, with live subscriber counts' })
	@ApiOkResponse({ type: [AdminPlanDto] })
	@Get('plans')
	plans(): Promise<AdminPlanDto[]> {
		return this.subscriptions.listPlans();
	}

	@ApiOperation({
		summary: 'Edit a plan',
		description:
			'New prices apply to new subscribers; existing ones keep theirs.',
	})
	@ApiOkResponse({ type: AdminPlanDto })
	@ApiNotFoundResponse({ description: 'PLAN_NOT_FOUND', type: ApiErrorDto })
	@Patch('plans/:id')
	updatePlan(
		@CurrentUser('id') adminId: string,
		@Param('id') id: string,
		@Body() dto: UpdatePlanDto,
	): Promise<AdminPlanDto> {
		return this.subscriptions.updatePlan(adminId, id, dto);
	}

	@ApiOperation({ summary: 'Paystack status for the Payment settings tab' })
	@ApiOkResponse({ type: PaymentSettingsDto })
	@Get('settings')
	settings(): PaymentSettingsDto {
		return this.subscriptions.settings();
	}

	@ApiOperation({
		summary: 'Download subscriptions as CSV',
		description: `Every subscription matching the filters. Capped at ${MAX_EXPORT_ROWS} rows.`,
	})
	@ApiProduces('text/csv')
	@ApiOkResponse({ description: 'A CSV file.' })
	@Get('export')
	async export(
		@Query() filters: AdminSubscriptionFiltersDto,
	): Promise<StreamableFile> {
		const stamp = new Date().toISOString().slice(0, 10);

		return new StreamableFile(
			Buffer.from(await this.subscriptions.exportCsv(filters)),
			{
				type: 'text/csv; charset=utf-8',
				disposition: `attachment; filename="instantconnect-subscriptions-${stamp}.csv"`,
			},
		);
	}

	@ApiOperation({ summary: 'One subscription, for the details sheet' })
	@ApiOkResponse({ type: AdminSubscriptionDetailDto })
	@ApiNotFoundResponse({
		description: 'SUBSCRIPTION_NOT_FOUND',
		type: ApiErrorDto,
	})
	@Get(':id')
	findOne(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<AdminSubscriptionDetailDto> {
		return this.subscriptions.findOne(id);
	}

	@ApiOperation({
		summary: 'Retry a failed renewal',
		description:
			'Charges the saved card again. The result arrives like any charge.',
	})
	@ApiNoContentResponse()
	@ApiConflictResponse({
		description: 'SUBSCRIPTION_NOT_FAILED, NO_SAVED_CARD',
		type: ApiErrorDto,
	})
	@Post(':id/retry')
	@HttpCode(HttpStatus.NO_CONTENT)
	retry(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
		return this.billing.retry(id);
	}

	@ApiOperation({
		summary: 'Refund the latest successful charge',
		description:
			'In full, through Paystack. The plan itself is left as it is.',
	})
	@ApiNoContentResponse()
	@ApiNotFoundResponse({
		description: 'PAYMENT_NOT_FOUND',
		type: ApiErrorDto,
	})
	@Post(':id/refund-last')
	@HttpCode(HttpStatus.NO_CONTENT)
	refundLast(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
		return this.billing.refundLast(id);
	}
}
