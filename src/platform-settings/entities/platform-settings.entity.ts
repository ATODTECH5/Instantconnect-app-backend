import {
	Check,
	Column,
	Entity,
	JoinColumn,
	ManyToOne,
	PrimaryColumn,
	UpdateDateColumn,
} from 'typeorm';

import { User } from '../../users/entities/user.entity';

export const PLATFORM_SETTINGS_ROW_ID = 1;

/**
 * One row, pinned by the check constraint. Only settings the server enforces
 * live here: a switch that changes nothing would mislead the admin who flips it.
 */
@Entity('platform_settings')
@Check('CHK_platform_settings_single_row', `"id" = 1`)
export class PlatformSettings {
	@PrimaryColumn({ type: 'smallint', default: PLATFORM_SETTINGS_ROW_ID })
	id!: number;

	@Column({ default: false })
	maintenanceMode!: boolean;

	@Column({ default: true })
	allowNewRegistrations!: boolean;

	/** Never below MINIMUM_AGE: the DTO floor on sign-up still applies. */
	@Column({ type: 'smallint', default: 18 })
	minimumAge!: number;

	@Column({ default: false })
	kycRequiredToJoinEvents!: boolean;

	@Column({ default: false })
	kycRequiredToCreateEvents!: boolean;

	@Column({ default: true })
	allowPaidEvents!: boolean;

	/**
	 * Platform wide push switches, one per category members can already
	 * silence for themselves. Off stops the push only: the notification is
	 * still stored and shown in the app. Safety checks ignore them.
	 */
	@Column({ default: true })
	pushMessages!: boolean;

	@Column({ default: true })
	pushConnections!: boolean;

	@Column({ default: true })
	pushEvents!: boolean;

	@Column({ default: true })
	pushMeetups!: boolean;

	@Column({ default: true })
	pushKyc!: boolean;

	@Column({ default: true })
	pushCommunities!: boolean;

	@Column({ default: false })
	kycSubmittedAlert!: boolean;

	@Column({ type: 'text', array: true, default: () => "'{}'" })
	adminAlertEmails!: string[];

	@Column({ default: true })
	lockoutEnabled!: boolean;

	@Column({ type: 'smallint', default: 5 })
	lockoutMaxAttempts!: number;

	@Column({ type: 'smallint', default: 15 })
	lockoutMinutes!: number;

	/** Refresh token lifetime when a member ticks "keep me signed in". */
	@Column({ type: 'smallint', default: 30 })
	keepSignedInDays!: number;

	/** Lower case. Matched as whole words in member written text. */
	@Column({ type: 'text', array: true, default: () => "'{}'" })
	blockedWords!: string[];

	/** Lower case hostnames; subdomains are blocked with them. */
	@Column({ type: 'text', array: true, default: () => "'{}'" })
	blockedDomains!: string[];

	@UpdateDateColumn({ type: 'timestamptz' })
	updatedAt!: Date;

	@Column({ type: 'uuid', nullable: true })
	updatedById!: string | null;

	@ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
	@JoinColumn({
		name: 'updatedById',
		foreignKeyConstraintName: 'FK_platform_settings_updatedById',
	})
	updatedBy!: User | null;
}
