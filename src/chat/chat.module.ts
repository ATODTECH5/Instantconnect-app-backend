import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { authConfig } from '../config/configuration';
import { NotificationsModule } from '../notifications/notifications.module';
import { PresenceModule } from '../presence/presence.module';
import { StorageModule } from '../storage/storage.module';
import { ChatGateway } from './chat.gateway';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ConversationParticipant } from './entities/conversation-participant.entity';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';

/**
 * Exports ChatService so connections can open a thread on accept. The
 * dependency only runs that way: chat never imports connections, since
 * membership rows carry everything it needs to authorise a thread.
 */
@Module({
	imports: [
		TypeOrmModule.forFeature([
			Conversation,
			ConversationParticipant,
			Message,
		]),
		StorageModule,
		PresenceModule,
		NotificationsModule,
		// Its own registration rather than AuthModule's, which does not export
		// JwtModule. The gateway only ever verifies a token, never signs one.
		JwtModule.registerAsync({
			inject: [authConfig.KEY],
			useFactory: (config: ConfigType<typeof authConfig>) => ({
				secret: config.accessSecret,
			}),
		}),
	],
	controllers: [ChatController],
	providers: [ChatService, ChatGateway],
	exports: [ChatService, ChatGateway],
})
export class ChatModule {}
