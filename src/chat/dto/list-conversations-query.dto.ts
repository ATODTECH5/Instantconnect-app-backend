import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination.dto';

/**
 * Backs the All / Unread / Favourites chips. Both filters are omitted for All,
 * and they compose, so Unread within Favourites is one request rather than a
 * client side intersection of two pages.
 */
export class ListConversationsQueryDto extends PaginationQueryDto {
	@ApiPropertyOptional({
		description: 'Only threads the viewer has favourited.',
	})
	@Transform(({ value }) => value === true || value === 'true')
	@IsBoolean()
	@IsOptional()
	favouritesOnly?: boolean;

	@ApiPropertyOptional({ description: 'Only threads with unread messages.' })
	@Transform(({ value }) => value === true || value === 'true')
	@IsBoolean()
	@IsOptional()
	unreadOnly?: boolean;
}
