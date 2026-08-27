/**
 * Drives the badge beside the name and the chip on the KYC row. The KYC module
 * that moves an account through these does not exist yet, so accounts sit at
 * `None` until it ships.
 */
export enum KycStatus {
	None = 'none',
	Pending = 'pending',
	Verified = 'verified',
	Rejected = 'rejected',
}
