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
		default: KycSubmissionStatus.Pending,
	})
	@IsOptional()
	@IsEnum(KycSubmissionStatus)
	status: KycSubmissionStatus = KycSubmissionStatus.Pending;
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

class KycApplicantDto {
	@ApiProperty({ format: 'uuid' })
	id: string;

	@ApiProperty()
	fullName: string;

	@ApiProperty()
	email: string;

	constructor(id: string, fullName: string, email: string) {
		this.id = id;
		this.fullName = fullName;
		this.email = email;
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

	constructor(row: KycSubmission, documents: KycDocumentUrlsDto) {
		super(row);
		this.applicant = new KycApplicantDto(
			row.user.id,
			row.user.fullName,
			row.user.email,
		);
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

export class KycSubmissionPageDto {
	@ApiProperty({ type: [KycSubmissionReviewDto] })
	items: KycSubmissionReviewDto[];

	@ApiProperty({ type: PageInfoDto })
	page: PageInfoDto;

	constructor(items: KycSubmissionReviewDto[], page: PageInfoDto) {
		this.items = items;
		this.page = page;
	}
}

export { KycDocumentUrlsDto };
