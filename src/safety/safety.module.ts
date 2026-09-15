import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MailModule } from '../mail/mail.module';
import { MeetupParticipant } from '../meetups/entities/meetup-participant.entity';
import { User } from '../users/entities/user.entity';
import { MeetupCircleSelection } from './entities/meetup-circle-selection.entity';
import { SafetyCircleMember } from './entities/safety-circle-member.entity';
import { SafetyCircle } from './entities/safety-circle.entity';
import { SafetyDispatch } from './entities/safety-dispatch.entity';
import { SafetyController } from './safety.controller';
import { SafetyService } from './safety.service';

/**
 * Exports SafetyService so meetups can dispatch on verification and on end.
 * Safety never imports the meetups service, only its entities, so there is
 * no cycle.
 */
@Module({
	imports: [
		TypeOrmModule.forFeature([
			SafetyCircle,
			SafetyCircleMember,
			MeetupCircleSelection,
			SafetyDispatch,
			MeetupParticipant,
			User,
		]),
		MailModule,
	],
	controllers: [SafetyController],
	providers: [SafetyService],
	exports: [SafetyService],
})
export class SafetyModule {}
