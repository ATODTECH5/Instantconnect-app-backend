import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Event } from '../events/entities/event.entity';
import { AdminEventbriteOrganizersController } from './admin-eventbrite-organizers.controller';
import { EventbriteOrganizer } from './entities/eventbrite-organizer.entity';
import { EventbriteClient } from './eventbrite.client';
import { EventbriteOrganizersService } from './eventbrite-organizers.service';
import { ExternalEventsService } from './external-events.service';

@Module({
	imports: [TypeOrmModule.forFeature([Event, EventbriteOrganizer])],
	controllers: [AdminEventbriteOrganizersController],
	providers: [
		EventbriteClient,
		ExternalEventsService,
		EventbriteOrganizersService,
	],
})
export class ExternalEventsModule {}
