import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Communities: groups members create, join and post in, plus the official
 * Safety Community. Every member belongs to the Safety Community without a
 * row in community_members, so it never needs backfilling as people sign up;
 * rows there are for everything else. Like and comment counts are kept on
 * the post, updated in the same transaction as the like or comment, so a
 * feed page never counts rows.
 */
export class Communities1759000000000 implements MigrationInterface {
	name = 'Communities1759000000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		for (const kind of [
			'community_invite',
			'community_comment',
			'community_reply',
		]) {
			await queryRunner.query(
				`ALTER TYPE "notifications_kind_enum" ADD VALUE IF NOT EXISTS '${kind}'`,
			);
		}

		await queryRunner.query(`
      CREATE TABLE "communities" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "name" varchar(60) NOT NULL,
        "description" varchar(500),
        "categoryId" varchar(32),
        "coverStorageId" varchar(255),
        "isPublic" boolean NOT NULL DEFAULT true,
        "isOfficial" boolean NOT NULL DEFAULT false,
        "creatorId" uuid,
        "lastActivityAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_communities_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_communities_categoryId" FOREIGN KEY ("categoryId")
          REFERENCES "categories"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_communities_creatorId" FOREIGN KEY ("creatorId")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
		await queryRunner.query(
			`CREATE UNIQUE INDEX "UQ_communities_official" ON "communities" ("isOfficial") WHERE "isOfficial"`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_communities_lastActivityAt" ON "communities" ("lastActivityAt")`,
		);

		await queryRunner.query(`
      CREATE TABLE "community_members" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "communityId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "isAdmin" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_community_members_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_community_members_communityId_userId" UNIQUE ("communityId", "userId"),
        CONSTRAINT "FK_community_members_communityId" FOREIGN KEY ("communityId")
          REFERENCES "communities"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_community_members_userId" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
		await queryRunner.query(
			`CREATE INDEX "IDX_community_members_userId" ON "community_members" ("userId")`,
		);

		await queryRunner.query(`
      CREATE TABLE "community_invites" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "communityId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "invitedById" uuid,
        CONSTRAINT "PK_community_invites_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_community_invites_communityId_userId" UNIQUE ("communityId", "userId"),
        CONSTRAINT "FK_community_invites_communityId" FOREIGN KEY ("communityId")
          REFERENCES "communities"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_community_invites_userId" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_community_invites_invitedById" FOREIGN KEY ("invitedById")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
		await queryRunner.query(
			`CREATE INDEX "IDX_community_invites_userId" ON "community_invites" ("userId")`,
		);

		await queryRunner.query(`
      CREATE TABLE "community_posts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "communityId" uuid NOT NULL,
        "authorId" uuid NOT NULL,
        "body" varchar(2000),
        "mediaStorageId" varchar(255),
        "isPinned" boolean NOT NULL DEFAULT false,
        "editedAt" TIMESTAMP WITH TIME ZONE,
        "likeCount" integer NOT NULL DEFAULT 0,
        "commentCount" integer NOT NULL DEFAULT 0,
        "isHidden" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_community_posts_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_community_posts_has_content"
          CHECK ("body" IS NOT NULL OR "mediaStorageId" IS NOT NULL),
        CONSTRAINT "FK_community_posts_communityId" FOREIGN KEY ("communityId")
          REFERENCES "communities"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_community_posts_authorId" FOREIGN KEY ("authorId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
		await queryRunner.query(
			`CREATE INDEX "IDX_community_posts_feed" ON "community_posts" ("communityId", "isPinned", "createdAt")`,
		);

		await queryRunner.query(`
      CREATE TABLE "community_post_likes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "postId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        CONSTRAINT "PK_community_post_likes_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_community_post_likes_postId_userId" UNIQUE ("postId", "userId"),
        CONSTRAINT "FK_community_post_likes_postId" FOREIGN KEY ("postId")
          REFERENCES "community_posts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_community_post_likes_userId" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

		await queryRunner.query(`
      CREATE TABLE "community_comments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "postId" uuid NOT NULL,
        "authorId" uuid NOT NULL,
        "parentId" uuid,
        "body" varchar(1000) NOT NULL,
        "likeCount" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_community_comments_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_community_comments_postId" FOREIGN KEY ("postId")
          REFERENCES "community_posts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_community_comments_authorId" FOREIGN KEY ("authorId")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_community_comments_parentId" FOREIGN KEY ("parentId")
          REFERENCES "community_comments"("id") ON DELETE CASCADE
      )
    `);
		await queryRunner.query(
			`CREATE INDEX "IDX_community_comments_postId_createdAt" ON "community_comments" ("postId", "createdAt")`,
		);

		await queryRunner.query(`
      CREATE TABLE "community_comment_likes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "commentId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        CONSTRAINT "PK_community_comment_likes_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_community_comment_likes_commentId_userId" UNIQUE ("commentId", "userId"),
        CONSTRAINT "FK_community_comment_likes_commentId" FOREIGN KEY ("commentId")
          REFERENCES "community_comments"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_community_comment_likes_userId" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

		await queryRunner.query(`
      CREATE TABLE "community_post_mutes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "postId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        CONSTRAINT "PK_community_post_mutes_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_community_post_mutes_postId_userId" UNIQUE ("postId", "userId"),
        CONSTRAINT "FK_community_post_mutes_postId" FOREIGN KEY ("postId")
          REFERENCES "community_posts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_community_post_mutes_userId" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

		await queryRunner.query(
			`CREATE TYPE "community_reports_reason_enum" AS ENUM ('spam', 'harassment', 'misinformation', 'hate_speech', 'violence', 'sexual_content', 'other')`,
		);
		await queryRunner.query(
			`CREATE TYPE "community_reports_status_enum" AS ENUM ('open', 'dismissed', 'removed')`,
		);
		await queryRunner.query(`
      CREATE TABLE "community_reports" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "postId" uuid NOT NULL,
        "reporterId" uuid NOT NULL,
        "reason" "community_reports_reason_enum" NOT NULL,
        "details" varchar(500),
        "status" "community_reports_status_enum" NOT NULL DEFAULT 'open',
        "reviewedById" uuid,
        "reviewedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_community_reports_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_community_reports_postId_reporterId" UNIQUE ("postId", "reporterId"),
        CONSTRAINT "FK_community_reports_postId" FOREIGN KEY ("postId")
          REFERENCES "community_posts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_community_reports_reporterId" FOREIGN KEY ("reporterId")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_community_reports_reviewedById" FOREIGN KEY ("reviewedById")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
		await queryRunner.query(
			`CREATE INDEX "IDX_community_reports_status_createdAt" ON "community_reports" ("status", "createdAt")`,
		);

		await queryRunner.query(`
      ALTER TABLE "platform_settings"
        ADD "pushCommunities" boolean NOT NULL DEFAULT true
    `);

		await queryRunner.query(`
      INSERT INTO "communities" ("name", "description", "isPublic", "isOfficial")
      VALUES (
        'Safety Community',
        'Your official hub for safety tips, trust reports, safe meetups, and direct communication from the community team.',
        true,
        true
      )
    `);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "platform_settings" DROP COLUMN "pushCommunities"`,
		);
		await queryRunner.query(`DROP TABLE "community_reports"`);
		await queryRunner.query(`DROP TYPE "community_reports_status_enum"`);
		await queryRunner.query(`DROP TYPE "community_reports_reason_enum"`);
		await queryRunner.query(`DROP TABLE "community_post_mutes"`);
		await queryRunner.query(`DROP TABLE "community_comment_likes"`);
		await queryRunner.query(`DROP TABLE "community_comments"`);
		await queryRunner.query(`DROP TABLE "community_post_likes"`);
		await queryRunner.query(`DROP TABLE "community_posts"`);
		await queryRunner.query(`DROP TABLE "community_invites"`);
		await queryRunner.query(`DROP TABLE "community_members"`);
		await queryRunner.query(`DROP TABLE "communities"`);
		// Postgres cannot remove a value from an enum; the notification kinds stay.
	}
}
