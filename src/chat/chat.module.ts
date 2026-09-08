import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StorageModule } from '../storage/storage.module';
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
	],
	controllers: [ChatController],
	providers: [ChatService],
	exports: [ChatService],
})
export class ChatModule {}
