import { Column, PrimaryColumn } from 'typeorm';

/**
 * Shared shape for the seeded pick lists the profile screens render. The primary
 * key is a slug rather than a uuid so the client can ship the same ids it posts
 * back, and so a row stays recognisable in a database dump.
 */
export abstract class LookupEntity {
	@PrimaryColumn({ length: 32 })
	id: string;

	@Column({ length: 64 })
	label: string;

	@Column({ type: 'int', default: 0 })
	sortOrder: number;

	@Column({ default: true })
	isActive: boolean;
}
