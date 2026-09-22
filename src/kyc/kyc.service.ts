import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { PageInfoDto } from '../common/dto/pagination.dto';
import { NotificationKind } from '../notifications/entities/notification-kind.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { Storage, type UploadSignature } from '../storage/storage';
import { KycStatus } from '../users/entities/kyc-status.enum';
import { User } from '../users/entities/user.entity';
import {
	KycDocumentUrlsDto,
	KycOverviewDto,
	KycSubmissionPageDto,
	KycSubmissionReviewDto,
	type ListKycSubmissionsQueryDto,
	type SubmitKycDto,
} from './dto/kyc.dto';
import {
	KycAdditionalIdKind,
	KycDocumentKind,
	KycSubmission,
	KycSubmissionStatus,
} from './entities/kyc-submission.entity';

const AUTHENTICATED = { authenticated: true } as const;

const ADDITIONAL_ID_DOCUMENT: Record<KycAdditionalIdKind, KycDocumentKind> = {
	[KycAdditionalIdKind.Passport]: KycDocumentKind.Passport,
	[KycAdditionalIdKind.DriversLicense]: KycDocumentKind.DriversLicense,
};

/**
 * Submission is one write: the four steps are collected on the device and
 * land together, so a half-finished attempt never exists on the server. The
 * decision is an admin's for now; a provider that answers automatically would
 * call {@link approve} or {@link reject} from a webhook and nothing else here
 * would change.
 */
@Injectable()
export class KycService {
	constructor(
		@InjectRepository(KycSubmission)
		private readonly submissions: Repository<KycSubmission>,
		@InjectRepository(User)
		private readonly users: Repository<User>,
		private readonly dataSource: DataSource,
		private readonly storage: Storage,
		private readonly notifications: NotificationsService,
	) {}

	async overview(userId: string): Promise<KycOverviewDto> {
		const [user, latest] = await Promise.all([
			this.users.findOneOrFail({
				where: { id: userId },
				select: { id: true, kycStatus: true },
			}),
			this.submissions.findOne({
				where: { userId },
				order: { createdAt: 'DESC' },
			}),
		]);

		return new KycOverviewDto(user.kycStatus, latest);
	}

	async createUploadSignature(
		userId: string,
		document: KycDocumentKind,
	): Promise<UploadSignature> {
		await this.assertCanSubmit(userId);

		return this.storage.createUploadSignature(
			this.storage.buildKycStorageId(userId, document),
			AUTHENTICATED,
		);
	}

	async submit(userId: string, input: SubmitKycDto): Promise<KycOverviewDto> {
		await this.assertCanSubmit(userId);

		const additionalIdDocument =
			ADDITIONAL_ID_DOCUMENT[input.additionalIdKind];

		await Promise.all([
			this.assertUploaded(
				userId,
				input.nationalIdStorageId,
				KycDocumentKind.NationalId,
			),
			this.assertUploaded(
				userId,
				input.additionalIdStorageId,
				additionalIdDocument,
			),
			this.assertUploaded(
				userId,
				input.utilityBillStorageId,
				KycDocumentKind.UtilityBill,
			),
			this.assertUploaded(
				userId,
				input.selfieStorageId,
				KycDocumentKind.Selfie,
			),
		]);

		await this.dataSource.transaction(async (manager) => {
			await manager.getRepository(KycSubmission).save(
				manager.getRepository(KycSubmission).create({
					userId,
					status: KycSubmissionStatus.Pending,
					...input,
				}),
			);
			await manager
				.getRepository(User)
				.update({ id: userId }, { kycStatus: KycStatus.Pending });
		});

		return this.overview(userId);
	}

	async list(
		query: ListKycSubmissionsQueryDto,
	): Promise<KycSubmissionPageDto> {
		const [rows, total] = await this.submissions.findAndCount({
			where: { status: query.status },
			relations: { user: true },
			order: { createdAt: 'ASC' },
			take: query.limit,
			skip: query.offset,
		});

		return new KycSubmissionPageDto(
			rows.map((row) => this.toReview(row)),
			new PageInfoDto(total, query),
		);
	}

	async findForReview(id: string): Promise<KycSubmissionReviewDto> {
		const row = await this.submissions.findOne({
			where: { id },
			relations: { user: true },
		});

		if (!row) throw this.notFound();

		return this.toReview(row);
	}

	approve(id: string, reviewerId: string): Promise<KycSubmissionReviewDto> {
		return this.decide(id, reviewerId, KycSubmissionStatus.Approved, null);
	}

	reject(
		id: string,
		reviewerId: string,
		reason: string,
	): Promise<KycSubmissionReviewDto> {
		return this.decide(
			id,
			reviewerId,
			KycSubmissionStatus.Rejected,
			reason,
		);
	}

	/**
	 * Locks the row so two reviewers cannot both decide it. The notification is
	 * raised after the commit: a rolled-back decision must not be announced.
	 */
	private async decide(
		id: string,
		reviewerId: string,
		outcome: KycSubmissionStatus.Approved | KycSubmissionStatus.Rejected,
		reason: string | null,
	): Promise<KycSubmissionReviewDto> {
		const decided = await this.dataSource.transaction(async (manager) => {
			const repo = manager.getRepository(KycSubmission);
			const row = await repo.findOne({
				where: { id },
				lock: { mode: 'pessimistic_write' },
			});

			if (!row) throw this.notFound();

			if (row.status !== KycSubmissionStatus.Pending) {
				throw new ConflictException({
					code: 'KYC_ALREADY_DECIDED',
					message: `That submission was already ${row.status}.`,
				});
			}

			row.status = outcome;
			row.reviewedAt = new Date();
			row.reviewedById = reviewerId;
			row.rejectionReason = reason;

			await repo.save(row);
			await manager.getRepository(User).update(
				{ id: row.userId },
				{
					kycStatus:
						outcome === KycSubmissionStatus.Approved
							? KycStatus.Verified
							: KycStatus.Rejected,
				},
			);

			return row;
		});

		await this.notifications.create({
			userId: decided.userId,
			kind:
				outcome === KycSubmissionStatus.Approved
					? NotificationKind.KycApproved
					: NotificationKind.KycRejected,
			subjectId: decided.id,
		});

		return this.findForReview(decided.id);
	}

	private async assertCanSubmit(userId: string): Promise<void> {
		const user = await this.users.findOneOrFail({
			where: { id: userId },
			select: { id: true, kycStatus: true },
		});

		if (user.kycStatus === KycStatus.Verified) {
			throw new ConflictException({
				code: 'KYC_ALREADY_VERIFIED',
				message: 'Your identity is already verified.',
			});
		}

		if (user.kycStatus === KycStatus.Pending) {
			throw new ConflictException({
				code: 'KYC_PENDING',
				message: 'Your documents are still being reviewed.',
			});
		}
	}

	/**
	 * The id must be one this account was signed for and for this document
	 * kind, and the file must actually be there. Anything else would let a
	 * submission point at another person's upload, or at nothing.
	 */
	private async assertUploaded(
		userId: string,
		storageId: string,
		document: KycDocumentKind,
	): Promise<void> {
		const prefix = `${document}-`;
		const ownedAndKind =
			this.storage.isKycStorageId(storageId, userId) &&
			storageId.split('/').at(-1)?.startsWith(prefix) === true;

		if (!ownedAndKind) {
			throw new BadRequestException({
				code: 'UPLOAD_NOT_OWNED',
				message: `The ${document.replace('_', ' ')} upload does not belong to this submission.`,
			});
		}

		if (!(await this.storage.findAsset(storageId, AUTHENTICATED))) {
			throw new BadRequestException({
				code: 'UPLOAD_NOT_FOUND',
				message: `The ${document.replace('_', ' ')} upload did not complete. Please try again.`,
			});
		}
	}

	private toReview(row: KycSubmission): KycSubmissionReviewDto {
		return new KycSubmissionReviewDto(
			row,
			new KycDocumentUrlsDto({
				nationalId: this.storage.buildAuthenticatedUrl(
					row.nationalIdStorageId,
				),
				additionalId: this.storage.buildAuthenticatedUrl(
					row.additionalIdStorageId,
				),
				utilityBill: this.storage.buildAuthenticatedUrl(
					row.utilityBillStorageId,
				),
				selfie: this.storage.buildAuthenticatedUrl(row.selfieStorageId),
			}),
		);
	}

	private notFound(): NotFoundException {
		return new NotFoundException({
			code: 'KYC_SUBMISSION_NOT_FOUND',
			message: 'That submission does not exist.',
		});
	}
}
