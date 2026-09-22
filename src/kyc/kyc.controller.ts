import {
	Body,
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
	ApiBadRequestResponse,
	ApiBearerAuth,
	ApiConflictResponse,
	ApiCreatedResponse,
	ApiForbiddenResponse,
	ApiNotFoundResponse,
	ApiOkResponse,
	ApiOperation,
	ApiServiceUnavailableResponse,
	ApiTags,
	ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ApiErrorDto } from '../common/dto/api-error.dto';
import { UploadSignatureResponseDto } from '../common/dto/upload-signature.dto';
import { UserRole } from '../users/entities/user-role.enum';
import {
	KycOverviewDto,
	KycSubmissionPageDto,
	KycSubmissionReviewDto,
	KycUploadSignatureDto,
	ListKycSubmissionsQueryDto,
	RejectKycDto,
	SubmitKycDto,
} from './dto/kyc.dto';
import { KycService } from './kyc.service';

@ApiTags('KYC')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED', type: ApiErrorDto })
@Controller('kyc')
export class KycController {
	constructor(private readonly kyc: KycService) {}

	@ApiOperation({
		summary: 'The viewer’s verification status and latest submission',
		description:
			'Documents are never returned here. A rejected submission carries the reason so the account can fix it and resubmit.',
	})
	@ApiOkResponse({ type: KycOverviewDto })
	@Get()
	overview(@CurrentUser('id') userId: string): Promise<KycOverviewDto> {
		return this.kyc.overview(userId);
	}

	@ApiOperation({
		summary: 'Sign a direct upload for one identity document',
		description:
			'Stored authenticated: the file can only be seen by a reviewer. Refused while a submission is pending or once verified.',
	})
	@ApiOkResponse({ type: UploadSignatureResponseDto })
	@ApiConflictResponse({
		description: 'KYC_PENDING, KYC_ALREADY_VERIFIED',
		type: ApiErrorDto,
	})
	@ApiServiceUnavailableResponse({
		description: 'STORAGE_NOT_CONFIGURED',
		type: ApiErrorDto,
	})
	@Post('upload-signature')
	@HttpCode(HttpStatus.OK)
	async uploadSignature(
		@CurrentUser('id') userId: string,
		@Body() dto: KycUploadSignatureDto,
	): Promise<UploadSignatureResponseDto> {
		return new UploadSignatureResponseDto(
			await this.kyc.createUploadSignature(userId, dto.document),
		);
	}

	@ApiOperation({
		summary: 'Submit all four steps for review',
		description:
			'Moves the account to pending. Every storage id must come from this account’s upload signatures and the upload must have completed.',
	})
	@ApiCreatedResponse({ type: KycOverviewDto })
	@ApiBadRequestResponse({
		description: 'VALIDATION_FAILED, UPLOAD_NOT_OWNED, UPLOAD_NOT_FOUND',
		type: ApiErrorDto,
	})
	@ApiConflictResponse({
		description: 'KYC_PENDING, KYC_ALREADY_VERIFIED',
		type: ApiErrorDto,
	})
	@Post('submissions')
	submit(
		@CurrentUser('id') userId: string,
		@Body() dto: SubmitKycDto,
	): Promise<KycOverviewDto> {
		return this.kyc.submit(userId, dto);
	}

	@ApiOperation({
		summary: 'Submissions awaiting review, oldest first',
		description: 'Admin only. Document URLs are signed for the reviewer.',
	})
	@ApiOkResponse({ type: KycSubmissionPageDto })
	@ApiForbiddenResponse({ description: 'FORBIDDEN', type: ApiErrorDto })
	@Roles(UserRole.Admin)
	@Get('submissions')
	list(
		@Query() query: ListKycSubmissionsQueryDto,
	): Promise<KycSubmissionPageDto> {
		return this.kyc.list(query);
	}

	@ApiOperation({ summary: 'One submission with its documents' })
	@ApiOkResponse({ type: KycSubmissionReviewDto })
	@ApiForbiddenResponse({ description: 'FORBIDDEN', type: ApiErrorDto })
	@ApiNotFoundResponse({
		description: 'KYC_SUBMISSION_NOT_FOUND',
		type: ApiErrorDto,
	})
	@Roles(UserRole.Admin)
	@Get('submissions/:id')
	find(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<KycSubmissionReviewDto> {
		return this.kyc.findForReview(id);
	}

	@ApiOperation({
		summary: 'Approve a submission',
		description:
			'Admin only. Turns the verified badge on and notifies the account.',
	})
	@ApiOkResponse({ type: KycSubmissionReviewDto })
	@ApiForbiddenResponse({ description: 'FORBIDDEN', type: ApiErrorDto })
	@ApiNotFoundResponse({
		description: 'KYC_SUBMISSION_NOT_FOUND',
		type: ApiErrorDto,
	})
	@ApiConflictResponse({
		description: 'KYC_ALREADY_DECIDED',
		type: ApiErrorDto,
	})
	@Roles(UserRole.Admin)
	@Post('submissions/:id/approve')
	@HttpCode(HttpStatus.OK)
	approve(
		@CurrentUser('id') reviewerId: string,
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<KycSubmissionReviewDto> {
		return this.kyc.approve(id, reviewerId);
	}

	@ApiOperation({
		summary: 'Reject a submission with a reason the account will see',
		description: 'Admin only. The account can submit again.',
	})
	@ApiOkResponse({ type: KycSubmissionReviewDto })
	@ApiForbiddenResponse({ description: 'FORBIDDEN', type: ApiErrorDto })
	@ApiNotFoundResponse({
		description: 'KYC_SUBMISSION_NOT_FOUND',
		type: ApiErrorDto,
	})
	@ApiConflictResponse({
		description: 'KYC_ALREADY_DECIDED',
		type: ApiErrorDto,
	})
	@Roles(UserRole.Admin)
	@Post('submissions/:id/reject')
	@HttpCode(HttpStatus.OK)
	reject(
		@CurrentUser('id') reviewerId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: RejectKycDto,
	): Promise<KycSubmissionReviewDto> {
		return this.kyc.reject(id, reviewerId, dto.reason);
	}
}
