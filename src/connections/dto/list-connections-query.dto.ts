import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { ConnectionStatus } from '../entities/connection-status.enum';

/**
 * `status` has to live on the same DTO as the pagination fields. Declared as a
 * bare `@Query('status')` beside `@Query() pagination`, the global
 * `forbidNonWhitelisted` pipe validates the query against PaginationQueryDto
 * alone and rejects the request with "property status should not exist".
 */
export class ListConnectionsQueryDto extends PaginationQueryDto {
	@ApiPropertyOptional({
		enum: ConnectionStatus,
		description: 'Omit to return every state.',
	})
	@IsEnum(ConnectionStatus)
	@IsOptional()
	status?: ConnectionStatus;
}
