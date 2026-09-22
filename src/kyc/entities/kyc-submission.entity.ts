import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

export enum KycSubmissionStatus {
	Pending = 'pending',
	Approved = 'approved',
	Rejected = 'rejected',
}

/** The second document on the ID step; the national ID is always required. */
export enum KycAdditionalIdKind {
	Passport = 'passport',
	DriversLicense = 'drivers_license',
}

/** What an upload signature is for. Becomes part of the storage id. */
export enum KycDocumentKind {
	NationalId = 'national_id',
	Passport = 'passport',
	DriversLicense = 'drivers_license',
	UtilityBill = 'utility_bill',
	Selfie = 'selfie',
}

export const KIN_RELATIONSHIPS = [
	'parent',
	'sibling',
	'spouse',
	'child',
	'guardian',
	'relative',
] as const;

export type KinRelationship = (typeof KIN_RELATIONSHIPS)[number];

/**
 * One row per attempt, kept after a decision so a rejection and what it was
 * based on can be revisited. The partial unique index below is what makes
 * "one open submission per account" a database fact rather than a check.
 * Documents are storage ids under the account's KYC folder, stored
 * authenticated, so nothing here is a URL anyone can open.
 */
@Entity('kyc_submissions')
@Index('IDX_kyc_submissions_status_createdAt', ['status', 'createdAt'])
@Index('UQ_kyc_submissions_userId_pending', ['userId'], {
	unique: true,
	where: `"status" = 'pending'`,
})
export class KycSubmission extends BaseEntity {
	@Column({ type: 'uuid' })
	userId!: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
	@JoinColumn({
		name: 'userId',
		foreignKeyConstraintName: 'FK_kyc_submissions_userId',
	})
	user!: User;

	@Column({
		type: 'enum',
		enum: KycSubmissionStatus,
		default: KycSubmissionStatus.Pending,
	})
	status!: KycSubmissionStatus;

	@Column({ type: 'varchar', length: 255 })
	nationalIdStorageId!: string;

	@Column({ type: 'enum', enum: KycAdditionalIdKind })
	additionalIdKind!: KycAdditionalIdKind;

	@Column({ type: 'varchar', length: 255 })
	additionalIdStorageId!: string;

	@Column({ type: 'varchar', length: 200 })
	addressLine!: string;

	@Column({ type: 'varchar', length: 80 })
	country!: string;

	@Column({ type: 'varchar', length: 80 })
	state!: string;

	@Column({ type: 'varchar', length: 80 })
	city!: string;

	@Column({ type: 'varchar', length: 255 })
	utilityBillStorageId!: string;

	@Column({ type: 'varchar', length: 80 })
	kinName!: string;

	@Column({ type: 'varchar', length: 20 })
	kinRelationship!: KinRelationship;

	@Column({ type: 'varchar', length: 16 })
	kinPhone!: string;

	@Column({ type: 'varchar', length: 255 })
	kinEmail!: string;

	@Column({ type: 'varchar', length: 200 })
	kinAddress!: string;

	@Column({ type: 'varchar', length: 255 })
	selfieStorageId!: string;

	@Column({ type: 'timestamptz', nullable: true })
	reviewedAt!: Date | null;

	@Column({ type: 'uuid', nullable: true })
	reviewedById!: string | null;

	@ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
	@JoinColumn({
		name: 'reviewedById',
		foreignKeyConstraintName: 'FK_kyc_submissions_reviewedById',
	})
	reviewedBy!: User | null;

	/** Shown to the account, so it is written for them rather than for the file. */
	@Column({ type: 'varchar', length: 300, nullable: true })
	rejectionReason!: string | null;
}
