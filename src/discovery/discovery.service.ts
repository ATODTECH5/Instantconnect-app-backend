import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { PageInfoDto } from '../common/dto/pagination.dto';
import { ConnectionsService } from '../connections/connections.service';
import { Storage } from '../storage/storage';
import {
	AVATAR_POSITION,
	UserPhoto,
} from '../users/entities/user-photo.entity';
import { KycStatus } from '../users/entities/kyc-status.enum';
import { User } from '../users/entities/user.entity';
import { UserStatus } from '../users/entities/user-status.enum';
import { onlineSince } from '../presence/online-window';
import { PresenceRegistry } from '../presence/presence-registry';
import type { DiscoveryQueryDto } from './dto/discovery-query.dto';
import { DiscoveryPageDto, NearbyPersonDto } from './dto/nearby-person.dto';
import { PersonProfileDto } from './dto/person-profile.dto';

const METRES_PER_KM = 1000;

/** The viewer's own point, built in SQL so PostGIS can use the GiST index. */
const ORIGIN = 'ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography';

@Injectable()
export class DiscoveryService {
	constructor(
		@InjectRepository(User)
		private readonly users: Repository<User>,
		@InjectRepository(UserPhoto)
		private readonly photos: Repository<UserPhoto>,
		private readonly connections: ConnectionsService,
		private readonly storage: Storage,
		private readonly presence: PresenceRegistry,
	) {}

	async findPeople(
		viewerId: string,
		query: DiscoveryQueryDto,
	): Promise<DiscoveryPageDto> {
		const viewer = await this.viewerOrigin(viewerId);
		const since = onlineSince();

		const parameters = {
			viewerId,
			lat: viewer.latitude,
			lng: viewer.longitude,
			radius: query.radiusKm * METRES_PER_KM,
			active: UserStatus.Active,
			...(query.categoryId ? { categoryId: query.categoryId } : {}),
			...(query.verifiedOnly ? { verified: KycStatus.Verified } : {}),
			...(query.onlineOnly ? { since } : {}),
		};

		const base = this.users
			.createQueryBuilder('user')
			.where('user.id != :viewerId')
			.andWhere('user.status = :active')
			.andWhere('user.location IS NOT NULL')
			.andWhere(`ST_DWithin(user.location, ${ORIGIN}, :radius)`)
			.setParameters(parameters);

		if (query.categoryId) {
			base.andWhere('user.categoryId = :categoryId');
		}

		if (query.verifiedOnly) {
			base.andWhere('user.kycStatus = :verified');
		}

		if (query.onlineOnly) {
			base.andWhere('user.lastActiveAt >= :since');
		}

		const total = await base.getCount();

		if (total === 0) {
			return new DiscoveryPageDto([], new PageInfoDto(0, query));
		}

		/**
		 * The one to many on photos is deliberately not joined here: TypeORM
		 * paginates a joined collection through a DISTINCT subquery that drops the
		 * computed distance, so avatars are fetched separately below.
		 */
		const { entities, raw } = await base
			.clone()
			.leftJoinAndSelect('user.category', 'category')
			.leftJoinAndSelect('user.occupation', 'occupation')
			.addSelect(`ST_Distance(user.location, ${ORIGIN})`, 'distance_m')
			.orderBy('distance_m', 'ASC')
			.addOrderBy('user.id', 'ASC')
			.take(query.limit)
			.skip(query.offset)
			.getRawAndEntities<{ distance_m: string }>();

		const ids = entities.map((user) => user.id);
		const [avatars, states] = await Promise.all([
			this.avatarUrlsFor(ids),
			this.connections.statesFor(viewerId, ids),
		]);

		const items = entities.map(
			(user, index) =>
				new NearbyPersonDto(
					user,
					Number(raw[index].distance_m),
					avatars.get(user.id) ?? null,
					states.get(user.id) ?? 'none',
					this.presence.isOnline(user.id, user.lastActiveAt, since),
				),
		);

		return new DiscoveryPageDto(items, new PageInfoDto(total, query));
	}

	async findPerson(
		viewerId: string,
		personId: string,
	): Promise<PersonProfileDto> {
		const origin = await this.viewerOrigin(viewerId);
		const since = onlineSince();

		const found = await this.users
			.createQueryBuilder('user')
			.leftJoinAndSelect('user.category', 'category')
			.leftJoinAndSelect('user.occupation', 'occupation')
			.leftJoinAndSelect('user.hobbies', 'hobby')
			.leftJoinAndSelect('user.photos', 'photo')
			.addSelect(`ST_Distance(user.location, ${ORIGIN})`, 'distance_m')
			.where('user.id = :personId')
			.andWhere('user.status = :active')
			.setParameters({
				personId,
				active: UserStatus.Active,
				lat: origin.latitude,
				lng: origin.longitude,
			})
			.getRawAndEntities<{ distance_m: string | null }>();

		const [person] = found.entities;

		if (!person) {
			throw new NotFoundException({
				code: 'USER_NOT_FOUND',
				message: 'That person is no longer available.',
			});
		}

		const photos = [...(person.photos ?? [])].sort(
			(a, b) => a.position - b.position,
		);
		const avatar = photos.find(
			(photo) => photo.position === AVATAR_POSITION,
		);
		const states = await this.connections.statesFor(viewerId, [personId]);

		return new PersonProfileDto(
			person,
			Number(found.raw[0]?.distance_m ?? 0),
			avatar
				? this.storage.buildUrl(avatar.storageId, 'thumbnail')
				: null,
			photos
				.filter((photo) => photo.position !== AVATAR_POSITION)
				.map((photo) => this.storage.buildUrl(photo.storageId, 'full')),
			states.get(personId) ?? 'none',
			this.presence.isOnline(person.id, person.lastActiveAt, since),
		);
	}

	/** Both reads need the viewer's point, and both fail the same way without one. */
	private async viewerOrigin(
		viewerId: string,
	): Promise<{ latitude: number; longitude: number }> {
		const viewer = await this.users.findOne({
			where: { id: viewerId },
			select: { id: true, latitude: true, longitude: true },
		});

		if (!viewer?.latitude || !viewer.longitude) {
			throw new BadRequestException({
				code: 'LOCATION_REQUIRED',
				message: 'Set your location to see people near you.',
			});
		}

		return { latitude: viewer.latitude, longitude: viewer.longitude };
	}

	private async avatarUrlsFor(
		userIds: string[],
	): Promise<Map<string, string>> {
		if (userIds.length === 0) return new Map();

		const rows = await this.photos.find({
			where: { userId: In(userIds), position: AVATAR_POSITION },
			select: { userId: true, storageId: true },
		});

		return new Map(
			rows.map((row) => [
				row.userId,
				this.storage.buildUrl(row.storageId, 'thumbnail'),
			]),
		);
	}
}
