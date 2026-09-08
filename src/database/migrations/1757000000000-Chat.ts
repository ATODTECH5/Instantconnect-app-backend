import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Chat, modelled on top of the connection that authorises it.
 *
 * A conversation shares its primary key with the connection it belongs to
 * rather than carrying a separate `connectionId`. There is exactly one thread
 * per accepted pair, so a surrogate key would only add a second identifier for
 * the same thing and a uniqueness constraint to keep them in step. It also
 * means the client can address a thread with the connection id it already
 * holds, before the first message exists.
 *
 * Favourite and read state hang off `conversation_participants` instead of the
 * conversation, because both are per person: either party can favourite a
 * thread the other has not, and each has their own read position. Paired
 * columns on the conversation would encode "requester's flag" and "addressee's
 * flag", forcing every query to branch on which party is asking.
 *
 * `lastMessageAt` is denormalised onto the conversation. The chat list is
 * ordered by it on every open, and ordering by a correlated subquery over
 * `messages` degrades as soon as a thread has any depth.
 *
 * Existing accepted connections are backfilled, so the chat list is populated
 * for everyone already connected rather than only for pairs who connect after
 * this ships.
 */
export class Chat1757000000000 implements MigrationInterface {
	name = 'Chat1757000000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
      CREATE TYPE "messages_kind_enum"
        AS ENUM ('text', 'image', 'system', 'meetup')
    `);

		await queryRunner.query(`
      CREATE TABLE "conversations" (
        "id" uuid NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "lastMessageAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_conversations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_conversations_id"
          FOREIGN KEY ("id") REFERENCES "connections" ("id") ON DELETE CASCADE
      )
    `);

		await queryRunner.query(`
      CREATE TABLE "conversation_participants" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "conversationId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "isFavourite" boolean NOT NULL DEFAULT false,
        "lastReadAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_conversation_participants" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_conversation_participants_pair"
          UNIQUE ("conversationId", "userId"),
        CONSTRAINT "FK_conversation_participants_conversationId"
          FOREIGN KEY ("conversationId") REFERENCES "conversations" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_conversation_participants_userId"
          FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);

		await queryRunner.query(`
      CREATE TABLE "messages" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "conversationId" uuid NOT NULL,
        "senderId" uuid NOT NULL,
        "kind" "messages_kind_enum" NOT NULL DEFAULT 'text',
        "body" text,
        "mediaStorageId" character varying(255),
        CONSTRAINT "PK_messages" PRIMARY KEY ("id"),
        CONSTRAINT "FK_messages_conversationId"
          FOREIGN KEY ("conversationId") REFERENCES "conversations" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_messages_senderId"
          FOREIGN KEY ("senderId") REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_messages_has_content"
          CHECK ("body" IS NOT NULL OR "mediaStorageId" IS NOT NULL)
      )
    `);

		await queryRunner.query(`
      CREATE INDEX "IDX_conversation_participants_userId"
        ON "conversation_participants" ("userId")
    `);

		await queryRunner.query(`
      CREATE INDEX "IDX_messages_conversationId_createdAt"
        ON "messages" ("conversationId", "createdAt" DESC)
    `);

		await queryRunner.query(`
      INSERT INTO "conversations" ("id")
      SELECT "id" FROM "connections" WHERE "status" = 'accepted'
    `);

		await queryRunner.query(`
      INSERT INTO "conversation_participants" ("conversationId", "userId")
      SELECT "id", "requesterId" FROM "connections" WHERE "status" = 'accepted'
      UNION ALL
      SELECT "id", "addresseeId" FROM "connections" WHERE "status" = 'accepted'
    `);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE "messages"`);
		await queryRunner.query(`DROP TABLE "conversation_participants"`);
		await queryRunner.query(`DROP TABLE "conversations"`);
		await queryRunner.query(`DROP TYPE "messages_kind_enum"`);
	}
}
