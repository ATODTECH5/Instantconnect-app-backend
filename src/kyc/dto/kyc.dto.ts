import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	IsEmail,
	IsEnum,
	IsIn,
	IsNotEmpty,
	IsOptional,
	IsString,
	Matches,
	MaxLength,
} from 'class-validator';

import {
	PageInfoDto,
	PaginationQueryDto,
} from '../../common/dto/pagination.dto';
import { KycStatus } from '../../users/entities/kyc-status.enum';
import {
	KIN_RELATIONSHIPS,
	KycAdditionalIdKind,
	KycDocumentKind,
	KycSubmissionStatus,
	type KinRelationship,
	type KycSubmission,
} from '../entities/kyc-submission.entity';

const trim = Transform(({ value }: { value: unknown }) =>
	typeof value === 'string' ? value.trim() : value,
);

const STORAGE_ID_MAX = 255;

export class KycUploadSignatureDto {
	@ApiProperty({ enum: KycDocumentKind, enumName: 'KycDocumentKind' })
	@IsEnum(KycDocumentKind)
	document!: KycDocumentKind;
}

export class SubmitKycDto {
	@ApiProperty({ description: 'From the national_id upload signature.' })
	@IsString()
	@IsNotEmpty()
	@MaxLength(STORAGE_ID_MAX)
	nationalIdStorageId!: string;

	@ApiProperty({ enum: KycAdditionalIdKind, enumName: 'KycAdditionalIdKind' })
	@IsEnum(KycAdditionalIdKind)
	additionalIdKind!: KycAdditionalIdKind;

	@ApiProperty({
		description:
			'From the passport or drivers_license signature, matching additionalIdKind.',
	})
	@IsString()
	@IsNotEmpty()
	@MaxLength(STORAGE_ID_MAX)
	additionalIdStorageId!: string;

	@ApiProperty({ maxLength: 200, example: '12 Adeola Odeku Street' })
	@trim
	@IsString()
	@IsNotEmpty()
	@MaxLength(200)
	addressLine!: string;

	@ApiProperty({ maxLength: 80, example: 'Nigeria' })
	@trim
	@IsString()
	@IsNotEmpty()
	@MaxLength(80)
	country!: string;

	@ApiProperty({ maxLength: 80, example: 'Lagos' })
	@trim
	@IsString()
	@IsNotEmpty()
	@MaxLength(80)
	state!: string;

	@ApiProperty({ maxLength: 80, example: 'Victoria Island' })
	@trim
	@IsString()
	@IsNotEmpty()
	@MaxLength(80)
	city!: string;

	@ApiProperty({ description: 'From the utility_bill upload signature.' })
	@IsString()
	@IsNotEmpty()
	@MaxLength(STORAGE_ID_MAX)
	utilityBillStorageId!: string;

	@ApiProperty({ maxLength: 80, example: 'Lawal Halima' })
	@trim
	@IsString()
	@IsNotEmpty()
	@MaxLength(80)
	kinName!: string;

	@ApiProperty({ enum: KIN_RELATIONSHIPS, example: 'sibling' })
	@IsIn(KIN_RELATIONSHIPS)
	kinRelationship!: KinRelationship;

	@ApiProperty({ example: '+2348012345678' })
	@trim
	@Matches(/^\+?[0-9]{7,15}$/, {
		message: 'kinPhone must be 7 to 15 digits, with an optional leading +',
	})
	kinPhone!: string;

	@ApiProperty({ example: 'halima@example.com' })
	@Transform(({ value }: { value: unknown }) =>
		typeof value === 'string' ? value.trim().toLowerCase() : value,
	)
	@IsEmail()
	@MaxLength(255)
	kinEmail!: string;

	@ApiProperty({ maxLength: 200 })
	@trim
	@IsString()
	@IsNotEmpty()
	@MaxLength(200)
	kinAddress!: string;

	@ApiProperty({ description: 'From the selfie upload signature.' })
	@IsString()
	@IsNotEmpty()
	@MaxLength(STORAGE_ID_MAX)
	selfieStorageId!: string;
}

export class RejectKycDto {
	@ApiProperty({
		maxLength: 300,
		example: 'The utility bill is older than three months.',
		description: 'Shown to the account on the KYC screen.',
	})
	@trim
	@IsString()
	@IsNotEmpty()
	@MaxLength(300)
	reason!: string;
}

export class ListKycSubmissionsQueryDto extends PaginationQueryDto {
	@ApiPropertyOptional({
		enum: KycSubmissionStatus,
		enumName: 'KycSubmissionStatus',
		description:
			'Omit for every submission. Pending comes oldest first, as a queue; everything else newest first.',
	})
	@IsOptional()
	@IsEnum(KycSubmissionStatus)
	status?: KycSubmissionStatus;

	@ApiPropertyOptional({
		description:
			'Matches anywhere in the applicant’s name or email, ignoring case.',
		maxLength: 100,
	})
	@IsOptional()
	@IsString()
	@MaxLength(100)
	@Transform(({ value }: { value: unknown }) =>
		typeof value === 'string' ? value.trim() || undefined : value,
	)
	search?: string;
}

/** What the account sees of its own latest attempt. Never a document. */
export class KycSubmissionSummaryDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty({ enum: KycSubmissionStatus, enumName: 'KycSubmissionStatus' })
	status: KycSubmissionStatus;

	@ApiProperty()
	submittedAt: string;

	@ApiPropertyOptional({ nullable: true })
	reviewedAt: string | null;

	@ApiPropertyOptional({ nullable: true })
	rejectionReason: string | null;

	constructor(row: KycSubmission) {
		this.id = row.id;
		this.status = row.status;
		this.submittedAt = row.createdAt.toISOString();
		this.reviewedAt = row.reviewedAt?.toISOString() ?? null;
		this.rejectionReason = row.rejectionReason;
	}
}

export class KycOverviewDto {
	@ApiProperty({ enum: KycStatus, enumName: 'KycStatus' })
	status: KycStatus;

	@ApiPropertyOptional({ type: KycSubmissionSummaryDto, nullable: true })
	submission: KycSubmissionSummaryDto | null;

	constructor(status: KycStatus, submission: KycSubmission | null) {
		this.status = status;
		this.submission = submission
			? new KycSubmissionSummaryDto(submission)
			: null;
	}
}

export type KycApplicant = {
	id: string;
	fullName: string;
	email: string;
	phone: string;
	dateOfBirth: string | null;
	avatarUrl: string | null;
};

class KycApplicantDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty()
	fullName: string;

	@ApiProperty()
	email: string;

	@ApiProperty({ example: '+2348123456789' })
	phone: string;

	@ApiProperty({
		nullable: true,
		type: String,
		format: 'date',
		description: 'From the account, to compare with the ID.',
	})
	dateOfBirth: string | null;

	@ApiProperty({ nullable: true, type: String })
	avatarUrl: string | null;

	constructor(applicant: KycApplicant) {
		this.id = applicant.id;
		this.fullName = applicant.fullName;
		this.email = applicant.email;
		this.phone = applicant.phone;
		this.dateOfBirth = applicant.dateOfBirth;
		this.avatarUrl = applicant.avatarUrl;
	}
}

class KycDocumentUrlsDto {
	@ApiProperty()
	nationalId: string;

	@ApiProperty()
	additionalId: string;

	@ApiProperty()
	utilityBill: string;

	@ApiProperty()
	selfie: string;

	constructor(urls: {
		nationalId: string;
		additionalId: string;
		utilityBill: string;
		selfie: string;
	}) {
		this.nationalId = urls.nationalId;
		this.additionalId = urls.additionalId;
		this.utilityBill = urls.utilityBill;
		this.selfie = urls.selfie;
	}
}

/** The reviewer's view: everything the account entered plus signed document URLs. */
export class KycSubmissionReviewDto extends KycSubmissionSummaryDto {
	@ApiProperty({ type: KycApplicantDto })
	applicant: KycApplicantDto;

	@ApiProperty({ enum: KycAdditionalIdKind, enumName: 'KycAdditionalIdKind' })
	additionalIdKind: KycAdditionalIdKind;

	@ApiProperty()
	addressLine: string;

	@ApiProperty()
	country: string;

	@ApiProperty()
	state: string;

	@ApiProperty()
	city: string;

	@ApiProperty()
	kinName: string;

	@ApiProperty({ enum: KIN_RELATIONSHIPS })
	kinRelationship: KinRelationship;

	@ApiProperty()
	kinPhone: string;

	@ApiProperty()
	kinEmail: string;

	@ApiProperty()
	kinAddress: string;

	@ApiProperty({ type: KycDocumentUrlsDto })
	documents: KycDocumentUrlsDto;

	@ApiPropertyOptional({
		nullable: true,
		type: String,
		description: 'The admin who decided it, by full name.',
	})
	reviewedByName: string | null;

	constructor(
		row: KycSubmission,
		applicant: KycApplicant,
		documents: KycDocumentUrlsDto,
	) {
		super(row);
		this.applicant = new KycApplicantDto(applicant);
		this.reviewedByName = row.reviewedBy?.fullName ?? null;
		this.additionalIdKind = row.additionalIdKind;
		this.addressLine = row.addressLine;
		this.country = row.country;
		this.state = row.state;
		this.city = row.city;
		this.kinName = row.kinName;
		this.kinRelationship = row.kinRelationship;
		this.kinPhone = row.kinPhone;
		this.kinEmail = row.kinEmail;
		this.kinAddress = row.kinAddress;
		this.documents = documents;
	}
}

export class KycSubmissionCountsDto {
	@ApiProperty({ example: 42 })
	all: number;

	@ApiProperty({ example: 28 })
	pending: number;

	@ApiProperty({ example: 11 })
	approved: number;

	@ApiProperty({ example: 3 })
	rejected: number;
}

export class KycSubmissionPageDto {
	@ApiProperty({ type: [KycSubmissionReviewDto] })
	items: KycSubmissionReviewDto[];

	@ApiProperty({ type: PageInfoDto })
	page: PageInfoDto;

	@ApiProperty({
		type: KycSubmissionCountsDto,
		description: 'Per status for the same search, for the tab badges.',
	})
	counts: KycSubmissionCountsDto;

	constructor(
		items: KycSubmissionReviewDto[],
		page: PageInfoDto,
		counts: KycSubmissionCountsDto,
	) {
		this.items = items;
		this.page = page;
		this.counts = counts;
	}
}

export class KycReviewStatsDto {
	@ApiProperty({
		description: 'Waiting for a decision, whenever submitted.',
		example: 28,
	})
	pending: number;

	@ApiProperty({ description: 'Since midnight in Lagos.', example: 12 })
	approvedToday: number;

	@ApiProperty({ description: 'Since midnight in Lagos.', example: 3 })
	rejectedToday: number;
}

export { KycDocumentUrlsDto };
