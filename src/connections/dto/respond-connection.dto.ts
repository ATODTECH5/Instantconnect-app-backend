import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

import { ConnectionStatus } from '../entities/connection-status.enum';

/** The two states a recipient can move a pending request into. */
export type ConnectionDecision =
	ConnectionStatus.Accepted | ConnectionStatus.Declined;

export class RespondConnectionDto {
	@ApiProperty({
		enum: [ConnectionStatus.Accepted, ConnectionStatus.Declined],
		example: ConnectionStatus.Accepted,
	})
	@IsIn([ConnectionStatus.Accepted, ConnectionStatus.Declined])
	status: ConnectionDecision;
}
