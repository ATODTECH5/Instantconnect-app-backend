import {
	Body,
	Controller,
	Delete,
	HttpCode,
	HttpStatus,
	Param,
	ParseIntPipe,
	Post,
	Put,
} from '@nestjs/common';
import {
	ApiBadRequestResponse,
	ApiBearerAuth,
	ApiNoContentResponse,
	ApiOkResponse,
	ApiOperation,
	ApiParam,
	ApiServiceUnavailableResponse,
	ApiTags,
	ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ApiErrorDto } from '../common/dto/api-error.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ProfileResponseDto } from './dto/profile-response.dto';
import { UploadSignatureResponseDto } from '../common/dto/upload-signature.dto';
import { ConfirmPhotoUploadDto } from './dto/photo-upload.dto';
import { UserPhotosService } from './user-photos.service';
import { UsersService } from './users.service';

/**
 * Two steps on purpose: the photo goes straight from the device to the storage
 * provider, and only the confirmation touches this API.
 */
@ApiTags('Profile photos')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'UNAUTHENTICATED', type: ApiErrorDto })
@ApiServiceUnavailableResponse({
	description: 'STORAGE_NOT_CONFIGURED',
	type: ApiErrorDto,
})
@ApiParam({
	name: 'position',
	description: '0 is the avatar, 1 to 3 are the gallery slots.',
	example: 1,
})
@Controller('users/me/photos')
export class UserPhotosController {
	constructor(
		private readonly photos: UserPhotosService,
		private readonly users: UsersService,
	) {}

	@ApiOperation({ summary: 'Get a signed direct upload for one photo slot' })
	@ApiOkResponse({ type: UploadSignatureResponseDto })
	@ApiBadRequestResponse({
		description: 'INVALID_PHOTO_POSITION',
		type: ApiErrorDto,
	})
	@Post(':position/upload-signature')
	@HttpCode(HttpStatus.OK)
	createUploadSignature(
		@CurrentUser('id') userId: string,
		@Param('position', ParseIntPipe) position: number,
	): UploadSignatureResponseDto {
		return new UploadSignatureResponseDto(
			this.photos.createUploadSignature(userId, position),
		);
	}

	@ApiOperation({
		summary: 'Attach a finished upload to its slot',
		description:
			'Replaces whatever occupied the slot, and deletes the old file.',
	})
	@ApiOkResponse({ type: ProfileResponseDto })
	@ApiBadRequestResponse({
		description: 'UPLOAD_NOT_FOUND or INVALID_UPLOAD_REFERENCE',
		type: ApiErrorDto,
	})
	@Put(':position')
	async confirmUpload(
		@CurrentUser('id') userId: string,
		@Param('position', ParseIntPipe) position: number,
		@Body() dto: ConfirmPhotoUploadDto,
	): Promise<ProfileResponseDto> {
		await this.photos.confirmUpload(userId, position, dto.storageId);

		return this.users.getProfile(userId);
	}

	@ApiOperation({ summary: 'Clear one photo slot' })
	@ApiNoContentResponse({ description: 'Removed, or already empty.' })
	@Delete(':position')
	@HttpCode(HttpStatus.NO_CONTENT)
	async remove(
		@CurrentUser('id') userId: string,
		@Param('position', ParseIntPipe) position: number,
	): Promise<void> {
		await this.photos.remove(userId, position);
	}
}
