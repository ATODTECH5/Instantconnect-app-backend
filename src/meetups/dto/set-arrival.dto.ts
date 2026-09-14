import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsIn } from 'class-validator';

import { ArrivalState } from '../entities/arrival-state.enum';

/** `pending` is the starting state and cannot be returned to. */
export class SetArrivalDto {
	@ApiProperty({ enum: [ArrivalState.EnRoute, ArrivalState.Arrived] })
	@IsEnum(ArrivalState)
	@IsIn([ArrivalState.EnRoute, ArrivalState.Arrived])
	state!: ArrivalState.EnRoute | ArrivalState.Arrived;
}
