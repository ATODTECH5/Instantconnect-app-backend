import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * What the admin Subscriptions page shows and does: the payment method behind
 * each charge (card brand, last four and expiry, or the bank), refunds, and a
 * retry of a failed renewal against the member's saved Paystack
 * authorization. The authorization code is only usable with this server's
 * secret key, so it is stored as Paystack issues it.
 */
export class PaymentDetails1759200000000 implements MigrationInterface {
	name = 'PaymentDetails1759200000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TYPE "payments_status_enum" ADD VALUE IF NOT EXISTS 'refunded'`,
		);
		await queryRunner.query(`
      ALTER TABLE "payments"
        ADD "cardBrand" varchar(20),
        ADD "cardLast4" varchar(4),
        ADD "cardExpiry" varchar(5),
        ADD "bank" varchar(80),
        ADD "refundedAt" TIMESTAMP WITH TIME ZONE
    `);
		await queryRunner.query(
			`ALTER TABLE "subscriptions" ADD "paystackAuthorizationCode" varchar(64)`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "subscriptions" DROP COLUMN "paystackAuthorizationCode"`,
		);
		await queryRunner.query(`
      ALTER TABLE "payments"
        DROP COLUMN "refundedAt",
        DROP COLUMN "bank",
        DROP COLUMN "cardExpiry",
        DROP COLUMN "cardLast4",
        DROP COLUMN "cardBrand"
    `);
		// Postgres cannot remove a value from an enum; 'refunded' stays.
	}
}
