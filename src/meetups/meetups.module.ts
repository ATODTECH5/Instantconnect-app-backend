import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ChatModule } from '../chat/chat.module';
import { ConversationParticipant } from '../chat/entities/conversation-participant.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { MeetupParticipant } from './entities/meetup-participant.entity';
import { Meetup } from './entities/meetup.entity';
import { MeetupsController } from './meetups.controller';
import { MeetupsService } from './meetups.service';

/**
 * Depends on chat, never the other way: chat only ever joins the Meetup
 * entity to embed a card's state, which is an entity import, not a service.
 */
@Module({
	imports: [
		TypeOrmModule.forFeature([
			Meetup,
			MeetupParticipant,
			ConversationParticipant,
		]),
		ChatModule,
		NotificationsModule,
	],
	controllers: [MeetupsController],
	providers: [MeetupsService],
	exports: [MeetupsService],
})
export class MeetupsModule {}
