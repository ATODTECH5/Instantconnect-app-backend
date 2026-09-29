import { ApiProperty } from '@nestjs/swagger';

const CHANGE_PCT = {
	description:
		'Percentage change against 30 days ago, one decimal. Null when there was nothing to compare against.',
	example: 12.5,
	nullable: true,
	type: Number,
};

export class CountStatDto {
	@ApiProperty({ example: 1284 })
	value: number;

	@ApiProperty(CHANGE_PCT)
	changePct: number | null;

	constructor(value: number, changePct: number | null) {
		this.value = value;
		this.changePct = changePct;
	}
}

export class RevenueStatDto {
	@ApiProperty({
		description:
			'Kobo. Always 0 for now: paid events cannot be joined until checkout exists.',
		example: 0,
	})
	amountMinor: number;

	@ApiProperty({ example: 'NGN' })
	currency: string;

	@ApiProperty(CHANGE_PCT)
	changePct: number | null;

	constructor(amountMinor: number, changePct: number | null) {
		this.amountMinor = amountMinor;
		this.currency = 'NGN';
		this.changePct = changePct;
	}
}

export class PendingStatDto {
	@ApiProperty({ example: 28 })
	value: number;

	constructor(value: number) {
		this.value = value;
	}
}

export class DashboardStatsDto {
	@ApiProperty({
		type: CountStatDto,
		description: 'Member accounts; admins are not counted.',
	})
	totalUsers: CountStatDto;

	@ApiProperty({
		type: CountStatDto,
		description: 'Events that have not ended yet.',
	})
	activeEvents: CountStatDto;

	@ApiProperty({ type: RevenueStatDto })
	revenue: RevenueStatDto;

	@ApiProperty({
		type: PendingStatDto,
		description: 'KYC submissions waiting for a reviewer.',
	})
	pendingKyc: PendingStatDto;
}
