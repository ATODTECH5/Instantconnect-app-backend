import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, type SelectQueryBuilder } from 'typeorm';

import { PageInfoDto } from '../common/dto/pagination.dto';
import { escapeLike } from '../common/utils/csv.util';
import { NotificationKind } from '../notifications/entities/notification-kind.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { Storage, type UploadSignature } from '../storage/storage';
import { KycStatus } from '../users/entities/kyc-status.enum';
import { User } from '../users/entities/user.entity';
import {
	KycDocumentUrlsDto,
	KycOverviewDto,
	KycReviewStatsDto,
	KycSubmissionCountsDto,
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

/** Every member is in Lagos, so "today" starts at Lagos midnight. */
const LAGOS_MIDNIGHT = `(date_trunc('day', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos')`;

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

	/**
	 * Submissions from deleted accounts are left out: there is no one left to
	 * verify, and their documents are only kept for the record.
	 */
	async list(
		query: ListKycSubmissionsQueryDto,
	): Promise<KycSubmissionPageDto> {
		const rowsQuery = this.reviewQuery();
		if (query.status) {
			rowsQuery.andWhere('s.status = :status', { status: query.status });
		}
		this.applySearch(rowsQuery, query.search);

		const oldestFirst = query.status === KycSubmissionStatus.Pending;
		rowsQuery
			.orderBy('s.createdAt', oldestFirst ? 'ASC' : 'DESC')
			.addOrderBy('s.id', oldestFirst ? 'ASC' : 'DESC')
			.offset(query.offset)
			.limit(query.limit);

		const countsQuery = this.submissions
			.createQueryBuilder('s')
			.innerJoin('s.user', 'u', 'u.deletedAt IS NULL')
			.select('s.status', 'status')
			.addSelect('count(*)::int', 'count')
			.groupBy('s.status');
		this.applySearch(countsQuery, query.search);

		const [[rows, total], counted] = await Promise.all([
			rowsQuery.getManyAndCount(),
			countsQuery.getRawMany<{
				status: KycSubmissionStatus;
				count: number;
			}>(),
		]);

		const counts: KycSubmissionCountsDto = {
			all: 0,
			pending: 0,
			approved: 0,
			rejected: 0,
		};
		for (const { status, count } of counted) {
			counts[status] = count;
			counts.all += count;
		}

		return new KycSubmissionPageDto(
			rows.map((row) => this.toReview(row)),
			new PageInfoDto(total, query),
			counts,
		);
	}

	async stats(): Promise<KycReviewStatsDto> {
		const [row] = await this.dataSource.query<KycReviewStatsDto[]>(
			`SELECT
         count(*) FILTER (WHERE s."status" = 'pending')::int AS "pending",
         count(*) FILTER (WHERE s."status" = 'approved'
           AND s."reviewedAt" >= ${LAGOS_MIDNIGHT})::int AS "approvedToday",
         count(*) FILTER (WHERE s."status" = 'rejected'
           AND s."reviewedAt" >= ${LAGOS_MIDNIGHT})::int AS "rejectedToday"
       FROM "kyc_submissions" s
       JOIN "users" u ON u."id" = s."userId" AND u."deletedAt" IS NULL`,
		);

		return row;
	}

	async findForReview(id: string): Promise<KycSubmissionReviewDto> {
		const row = await this.reviewQuery()
			.andWhere('s.id = :id', { id })
			.getOne();

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

			const applicantExists =
				row &&
				(await manager.getRepository(User).exists({
					where: { id: row.userId },
				}));

			if (!row || !applicantExists) throw this.notFound();

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

	/** The applicant, the reviewer's name and the profile photo, in one query. */
	private reviewQuery(): SelectQueryBuilder<KycSubmission> {
		return this.submissions
			.createQueryBuilder('s')
			.innerJoinAndSelect('s.user', 'u', 'u.deletedAt IS NULL')
			.leftJoinAndSelect('u.photos', 'p', 'p.position = 0')
			.leftJoin('s.reviewedBy', 'r')
			.addSelect(['r.id', 'r.fullName']);
	}

	private applySearch(
		query: SelectQueryBuilder<KycSubmission>,
		search: string | undefined,
	): void {
		if (!search) return;

		query.andWhere('(u.fullName ILIKE :search OR u.email ILIKE :search)', {
			search: `%${escapeLike(search)}%`,
		});
	}

	private toReview(row: KycSubmission): KycSubmissionReviewDto {
		const avatar = row.user.photos?.[0];

		return new KycSubmissionReviewDto(
			row,
			{
				id: row.user.id,
				fullName: row.user.fullName,
				email: row.user.email,
				phone: row.user.phone,
				dateOfBirth: row.user.dateOfBirth,
				avatarUrl: avatar
					? this.storage.buildUrl(avatar.storageId, 'thumbnail')
					: null,
			},
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
