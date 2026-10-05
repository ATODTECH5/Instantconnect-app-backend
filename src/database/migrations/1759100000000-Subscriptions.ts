import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Paid plans through Paystack. Plans move from the app's hard coded catalogue
 * to the server so prices can change without a release; Paystack plan codes
 * are created on first checkout and cleared when a price changes, so existing
 * subscribers keep the price they signed up at.
 *
 * One live subscription per member, enforced by a partial unique index.
 * Payments are kept per charge, first checkout and renewals alike, with the
 * Paystack reference unique so a webhook delivered twice is recorded once.
 */
export class Subscriptions1759100000000 implements MigrationInterface {
	name = 'Subscriptions1759100000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
      CREATE TABLE "subscription_plans" (
        "id" varchar(16) NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "name" varchar(60) NOT NULL,
        "tagline" varchar(120) NOT NULL,
        "description" varchar(300) NOT NULL,
        "features" text[] NOT NULL DEFAULT '{}',
        "monthlyPriceMinor" integer NOT NULL,
        "annualPriceMinor" integer NOT NULL,
        "sortOrder" smallint NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        "paystackMonthlyPlanCode" varchar(64),
        "paystackAnnualPlanCode" varchar(64),
        "updatedById" uuid,
        CONSTRAINT "PK_subscription_plans_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_subscription_plans_prices" CHECK ("monthlyPriceMinor" > 0 AND "annualPriceMinor" > 0),
        CONSTRAINT "FK_subscription_plans_updatedById" FOREIGN KEY ("updatedById")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
		await queryRunner.query(`
      INSERT INTO "subscription_plans"
        ("id", "name", "tagline", "description", "features", "monthlyPriceMinor", "annualPriceMinor", "sortOrder")
      VALUES
        ('premium', 'Premium Elite', 'Best for active local explorers',
         'Go further with unlimited connections, priority discovery and no ads.',
         ARRAY['Unlimited community connections', 'Priority listing in Discover flow', 'Create unlimited social meetups', 'Ad-free native experience'],
         250000, 2400000, 1),
        ('pro', 'Pro Creator', 'For super hosts and communities',
         'Elevate your social discovery with powerful interactions and infinite reach.',
         ARRAY['All Premium package features', 'Verified creator profile badge', 'Featured profile highlight locally', 'Dedicated priority helpdesk', 'Advanced visitor analytics dashboard'],
         500000, 4800000, 2)
    `);

		await queryRunner.query(
			`CREATE TYPE "subscriptions_cycle_enum" AS ENUM ('monthly', 'annual')`,
		);
		await queryRunner.query(
			`CREATE TYPE "subscriptions_status_enum" AS ENUM ('active', 'non_renewing', 'past_due', 'cancelled', 'expired')`,
		);
		await queryRunner.query(`
      CREATE TABLE "subscriptions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "userId" uuid NOT NULL,
        "planId" varchar(16) NOT NULL,
        "cycle" "subscriptions_cycle_enum" NOT NULL,
        "status" "subscriptions_status_enum" NOT NULL,
        "currentPeriodEnd" TIMESTAMP WITH TIME ZONE NOT NULL,
        "paystackCustomerCode" varchar(64),
        "paystackSubscriptionCode" varchar(64),
        "paystackEmailToken" varchar(64),
        "paystackPlanCode" varchar(64),
        "cancelledAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_subscriptions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_subscriptions_userId" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_subscriptions_planId" FOREIGN KEY ("planId")
          REFERENCES "subscription_plans"("id")
      )
    `);
		await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_subscriptions_live_per_user" ON "subscriptions" ("userId")
        WHERE "status" IN ('active', 'non_renewing', 'past_due')
    `);
		await queryRunner.query(
			`CREATE INDEX "IDX_subscriptions_paystackSubscriptionCode" ON "subscriptions" ("paystackSubscriptionCode")`,
		);

		await queryRunner.query(
			`CREATE TYPE "payments_status_enum" AS ENUM ('pending', 'success', 'failed', 'abandoned')`,
		);
		await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "userId" uuid NOT NULL,
        "subscriptionId" uuid,
        "planId" varchar(16) NOT NULL,
        "cycle" "subscriptions_cycle_enum" NOT NULL,
        "reference" varchar(100) NOT NULL,
        "amountMinor" integer NOT NULL,
        "currency" varchar(3) NOT NULL DEFAULT 'NGN',
        "status" "payments_status_enum" NOT NULL DEFAULT 'pending',
        "channel" varchar(32),
        "paidAt" TIMESTAMP WITH TIME ZONE,
        "failureReason" varchar(255),
        CONSTRAINT "PK_payments_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payments_reference" UNIQUE ("reference"),
        CONSTRAINT "FK_payments_userId" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_payments_subscriptionId" FOREIGN KEY ("subscriptionId")
          REFERENCES "subscriptions"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_payments_planId" FOREIGN KEY ("planId")
          REFERENCES "subscription_plans"("id")
      )
    `);
		await queryRunner.query(
			`CREATE INDEX "IDX_payments_userId_createdAt" ON "payments" ("userId", "createdAt")`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_payments_status_paidAt" ON "payments" ("status", "paidAt")`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE "payments"`);
		await queryRunner.query(`DROP TYPE "payments_status_enum"`);
		await queryRunner.query(`DROP TABLE "subscriptions"`);
		await queryRunner.query(`DROP TYPE "subscriptions_status_enum"`);
		await queryRunner.query(`DROP TYPE "subscriptions_cycle_enum"`);
		await queryRunner.query(`DROP TABLE "subscription_plans"`);
	}
}
