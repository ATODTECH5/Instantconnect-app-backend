import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import { BlocksService } from '../blocks/blocks.service';
import { ChatGateway } from '../chat/chat.gateway';
import { PageInfoDto } from '../common/dto/pagination.dto';
import { escapeLike } from '../common/utils/csv.util';
import { ConnectionsService } from '../connections/connections.service';
import { NotificationKind } from '../notifications/entities/notification-kind.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { ContentPolicyService } from '../platform-settings/content-policy.service';
import { Category } from '../reference/entities/category.entity';
import {
	type CommunityMediaKind,
	Storage,
	type UploadSignature,
} from '../storage/storage';
import { AVATAR_POSITION } from '../users/entities/user-photo.entity';
import { UserRole } from '../users/entities/user-role.enum';
import { UserStatus } from '../users/entities/user-status.enum';
import { User } from '../users/entities/user.entity';
import {
	COMMUNITY_FACES,
	CommunityDetailDto,
	CommunityMemberDto,
	CommunityMemberPageDto,
	CommunityPageDto,
	CommunityPersonDto,
	CommunityScope,
	CommunitySummaryDto,
	type CommunityViewerDto,
	type CreateCommunityDto,
	InvitableConnectionDto,
	InvitableConnectionPageDto,
	InvitableState,
	type ListCommunitiesQueryDto,
	type ListCommunityMembersQueryDto,
	type ListInvitableQueryDto,
	type UpdateCommunityDto,
} from './dto/community.dto';
import { CommunityInvite } from './entities/community-invite.entity';
import { CommunityMember } from './entities/community-member.entity';
import { Community } from './entities/community.entity';

export const PERSON_SELECT = {
	id: true,
	fullName: true,
	username: true,
	kycStatus: true,
	role: true,
	photos: { position: true, storageId: true },
} as const;

/**
 * Everyone who belongs to the Safety Community: active member accounts.
 * Deleted accounts are already left out by the query builder.
 */
const SAFETY_MEMBERS = {
	clause: 'user.role = :memberRole AND user.status = :activeStatus',
	params: { memberRole: UserRole.User, activeStatus: UserStatus.Active },
};

/** Who the viewer is to one community, worked out once per request. */
export type CommunityAccess = {
	community: Community;
	isMember: boolean;
	isAdmin: boolean;
	isInvited: boolean;
	canView: boolean;
	/** True for the viewer's own platform admin account. */
	isPlatformAdmin: boolean;
};

@Injectable()
export class CommunitiesService {
	private readonly logger = new Logger(CommunitiesService.name);

	constructor(
		@InjectRepository(Community)
		private readonly communities: Repository<Community>,
		@InjectRepository(CommunityMember)
		private readonly members: Repository<CommunityMember>,
		@InjectRepository(CommunityInvite)
		private readonly invites: Repository<CommunityInvite>,
		@InjectRepository(Category)
		private readonly categories: Repository<Category>,
		private readonly dataSource: DataSource,
		private readonly storage: Storage,
		private readonly connections: ConnectionsService,
		private readonly notifications: NotificationsService,
		private readonly gateway: ChatGateway,
		private readonly contentPolicy: ContentPolicyService,
	) {}

	createUploadSignature(
		userId: string,
		kind: CommunityMediaKind,
	): UploadSignature {
		return this.storage.createUploadSignature(
			this.storage.buildCommunityStorageId(userId, kind),
		);
	}

	async list(
		viewerId: string,
		query: ListCommunitiesQueryDto,
	): Promise<CommunityPageDto> {
		const base = this.communities
			.createQueryBuilder('community')
			.leftJoin('community.creator', 'creator')
			.setParameters({ viewerId });
		const isMember = `EXISTS (SELECT 1 FROM "community_members" m
			WHERE m."communityId" = community.id AND m."userId" = :viewerId)`;
		const isInvited = `EXISTS (SELECT 1 FROM "community_invites" i
			WHERE i."communityId" = community.id AND i."userId" = :viewerId)`;
		const memberCount = `(SELECT COUNT(*) FROM "community_members" m
			WHERE m."communityId" = community.id)`;

		switch (query.scope) {
			case CommunityScope.Joined:
				base.where(`(community.isOfficial OR ${isMember})`)
					.orderBy('community.isOfficial', 'DESC')
					.addOrderBy('community.lastActivityAt', 'DESC');
				break;
			case CommunityScope.Mine:
				base.where('community.creatorId = :viewerId').orderBy(
					'community.lastActivityAt',
					'DESC',
				);
				break;
			case CommunityScope.Suggested:
				base.where('community.isPublic AND NOT community.isOfficial')
					.andWhere(`NOT ${isMember}`)
					.andWhere(
						BlocksService.hiddenFromViewerClause(
							'creator',
							'viewerId',
						),
					)
					.orderBy(memberCount, 'DESC')
					.addOrderBy('community.lastActivityAt', 'DESC');
				break;
			case CommunityScope.All:
				base.where(
					`(community.isPublic OR community.isOfficial OR ${isMember} OR ${isInvited})`,
				)
					.andWhere(
						BlocksService.hiddenFromViewerClause(
							'creator',
							'viewerId',
						),
					)
					.orderBy('community.isOfficial', 'DESC')
					.addOrderBy('community.lastActivityAt', 'DESC');
				break;
		}

		if (query.search) {
			base.andWhere('community.name ILIKE :search', {
				search: `%${escapeLike(query.search)}%`,
			});
		}

		const [rows, total] = await base
			.leftJoinAndSelect('community.category', 'category')
			.addOrderBy('community.id', 'ASC')
			.limit(query.limit)
			.offset(query.offset)
			.getManyAndCount();

		return new CommunityPageDto(
			await this.summaries(rows, viewerId),
			new PageInfoDto(total, query),
		);
	}

	async create(
		viewerId: string,
		input: CreateCommunityDto,
	): Promise<CommunityDetailDto> {
		const inviteeIds = input.inviteeIds ?? [];

		await this.contentPolicy.assertAllowed(input.name, input.description);
		await Promise.all([
			this.assertCategory(input.categoryId),
			this.assertCover(viewerId, input.coverStorageId),
			this.assertConnected(viewerId, inviteeIds),
		]);

		const communityId = await this.dataSource.transaction(
			async (manager) => {
				const communities = manager.getRepository(Community);
				const saved = await communities.save(
					communities.create({
						name: input.name,
						description: input.description || null,
						categoryId: input.categoryId ?? null,
						coverStorageId: input.coverStorageId ?? null,
						isPublic: input.isPublic,
						creatorId: viewerId,
					}),
				);
				const members = manager.getRepository(CommunityMember);

				await members.save(
					members.create({
						communityId: saved.id,
						userId: viewerId,
						isAdmin: true,
					}),
				);

				if (inviteeIds.length > 0) {
					const invites = manager.getRepository(CommunityInvite);

					await invites.save(
						inviteeIds.map((userId) =>
							invites.create({
								communityId: saved.id,
								userId,
								invitedById: viewerId,
							}),
						),
					);
				}

				return saved.id;
			},
		);

		await this.notifyInvitees(viewerId, communityId, inviteeIds);

		return this.findOne(viewerId, communityId);
	}

	/** A private community reads as missing to outsiders, so it is not disclosed. */
	async findOne(viewerId: string, id: string): Promise<CommunityDetailDto> {
		const access = await this.access(viewerId, id);

		if (!access.canView) throw this.notFound();

		const community = await this.communities.findOneOrFail({
			where: { id },
			relations: { category: true, creator: { photos: true } },
			select: {
				id: true,
				createdAt: true,
				name: true,
				description: true,
				categoryId: true,
				coverStorageId: true,
				isPublic: true,
				isOfficial: true,
				creatorId: true,
				lastActivityAt: true,
				category: { id: true, label: true },
				creator: PERSON_SELECT,
			},
		});
		const [summary] = await this.summaries([community], viewerId);

		return new CommunityDetailDto(community, {
			coverUrl: summary.coverUrl,
			memberCount: summary.memberCount,
			memberPreview: summary.memberPreview,
			viewer: summary.viewer,
			creator: community.creator
				? this.toPerson(community.creator)
				: null,
		});
	}

	async update(
		viewerId: string,
		id: string,
		changes: UpdateCommunityDto,
	): Promise<CommunityDetailDto> {
		const access = await this.adminAccess(viewerId, id);

		if (access.community.isOfficial) throw this.officialLocked();

		await this.contentPolicy.assertAllowed(
			changes.name,
			changes.description,
		);

		if (changes.categoryId) await this.assertCategory(changes.categoryId);
		if (changes.coverStorageId) {
			await this.assertCover(viewerId, changes.coverStorageId);
		}

		await this.communities.update(id, {
			...(changes.name !== undefined ? { name: changes.name } : {}),
			...(changes.description !== undefined
				? { description: changes.description || null }
				: {}),
			...(changes.categoryId !== undefined
				? { categoryId: changes.categoryId }
				: {}),
			...(changes.coverStorageId !== undefined
				? { coverStorageId: changes.coverStorageId }
				: {}),
			...(changes.isPublic !== undefined
				? { isPublic: changes.isPublic }
				: {}),
		});

		return this.findOne(viewerId, id);
	}

	async remove(viewerId: string, id: string): Promise<void> {
		const access = await this.adminAccess(viewerId, id);

		if (access.community.isOfficial) throw this.officialLocked();

		await this.communities.delete(id);
	}

	/**
	 * Public communities are open to anyone; private ones need an invitation,
	 * which joining spends. Joining twice is one join.
	 */
	async join(viewerId: string, id: string): Promise<CommunityDetailDto> {
		const access = await this.access(viewerId, id);

		if (!access.canView) throw this.notFound();

		if (!access.isMember) {
			if (!access.community.isPublic && !access.isInvited) {
				throw new ForbiddenException({
					code: 'COMMUNITY_INVITE_REQUIRED',
					message:
						'This community is private. Ask a member to invite you.',
				});
			}

			await this.dataSource.transaction(async (manager) => {
				await manager
					.createQueryBuilder()
					.insert()
					.into(CommunityMember)
					.values({ communityId: id, userId: viewerId })
					.orIgnore()
					.execute();
				await manager.delete(CommunityInvite, {
					communityId: id,
					userId: viewerId,
				});
			});
		}

		return this.findOne(viewerId, id);
	}

	/**
	 * A community is never left without an admin: if the last one leaves, the
	 * longest standing member takes over.
	 */
	async leave(viewerId: string, id: string): Promise<void> {
		const access = await this.access(viewerId, id);

		if (access.community.isOfficial) {
			throw new BadRequestException({
				code: 'COMMUNITY_OFFICIAL',
				message: 'Everyone stays in the Safety Community.',
			});
		}

		if (!access.isMember) return;

		await this.dataSource.transaction(async (manager) => {
			await manager.delete(CommunityMember, {
				communityId: id,
				userId: viewerId,
			});
			await this.ensureAdmin(manager.getRepository(CommunityMember), id);
		});
	}

	async listMembers(
		viewerId: string,
		id: string,
		query: ListCommunityMembersQueryDto,
	): Promise<CommunityMemberPageDto> {
		const access = await this.access(viewerId, id);

		if (!access.canView) throw this.notFound();

		const search = query.search
			? `%${escapeLike(query.search)}%`
			: undefined;

		if (access.community.isOfficial) {
			const usersQuery = this.dataSource
				.getRepository(User)
				.createQueryBuilder('user')
				.leftJoinAndSelect('user.photos', 'photo')
				.where(SAFETY_MEMBERS.clause, SAFETY_MEMBERS.params)
				.orderBy('user.createdAt', 'ASC')
				.addOrderBy('user.id', 'ASC');

			if (search) {
				usersQuery.andWhere(
					'(user.fullName ILIKE :search OR user.username ILIKE :search)',
					{ search },
				);
			}

			const [users, total] = await usersQuery
				.take(query.limit)
				.skip(query.offset)
				.getManyAndCount();

			return new CommunityMemberPageDto(
				users.map(
					(user) =>
						new CommunityMemberDto(user, this.avatarUrl(user), {
							isAdmin: false,
							joinedAt: user.createdAt,
						}),
				),
				new PageInfoDto(total, query),
			);
		}

		const membersQuery = this.members
			.createQueryBuilder('member')
			.innerJoinAndSelect('member.user', 'user')
			.leftJoinAndSelect('user.photos', 'photo')
			.where('member.communityId = :id', { id })
			.orderBy('member.isAdmin', 'DESC')
			.addOrderBy('member.createdAt', 'ASC')
			.addOrderBy('member.id', 'ASC');

		if (search) {
			membersQuery.andWhere(
				'(user.fullName ILIKE :search OR user.username ILIKE :search)',
				{ search },
			);
		}

		const [rows, total] = await membersQuery
			.take(query.limit)
			.skip(query.offset)
			.getManyAndCount();

		return new CommunityMemberPageDto(
			rows.map(
				(row) =>
					new CommunityMemberDto(row.user, this.avatarUrl(row.user), {
						isAdmin: row.isAdmin,
						joinedAt: row.createdAt,
					}),
			),
			new PageInfoDto(total, query),
		);
	}

	async removeMember(
		viewerId: string,
		id: string,
		userId: string,
	): Promise<void> {
		const access = await this.adminAccess(viewerId, id);

		if (access.community.isOfficial) throw this.officialLocked();

		if (userId === viewerId) {
			throw new BadRequestException({
				code: 'COMMUNITY_REMOVE_SELF',
				message: 'Use Leave Community to leave it yourself.',
			});
		}

		await this.members.delete({ communityId: id, userId });
	}

	async setAdmin(
		viewerId: string,
		id: string,
		userId: string,
		isAdmin: boolean,
	): Promise<CommunityMemberDto> {
		const access = await this.adminAccess(viewerId, id);

		if (access.community.isOfficial) throw this.officialLocked();

		const membership = await this.members.findOne({
			where: { communityId: id, userId },
			relations: { user: { photos: true } },
		});

		if (!membership) {
			throw new NotFoundException({
				code: 'COMMUNITY_MEMBER_NOT_FOUND',
				message: 'That person is not a member of this community.',
			});
		}

		if (!isAdmin && membership.isAdmin) {
			const admins = await this.members.count({
				where: { communityId: id, isAdmin: true },
			});

			if (admins <= 1) {
				throw new BadRequestException({
					code: 'COMMUNITY_LAST_ADMIN',
					message: 'Make someone else an admin first.',
				});
			}
		}

		await this.members.update(membership.id, { isAdmin });

		return new CommunityMemberDto(
			membership.user,
			this.avatarUrl(membership.user),
			{ isAdmin, joinedAt: membership.createdAt },
		);
	}

	/**
	 * Accepted connections only. Admins can always invite; in a public
	 * community any member can, since anyone could join it anyway. People
	 * already in it are skipped, and an invitation is only sent once.
	 */
	async invite(
		viewerId: string,
		id: string,
		userIds: string[],
	): Promise<void> {
		const access = await this.access(viewerId, id);

		if (!access.canView) throw this.notFound();
		if (access.community.isOfficial) throw this.officialLocked();
		if (
			!access.isAdmin &&
			!(access.isMember && access.community.isPublic)
		) {
			throw new ForbiddenException({
				code: 'COMMUNITY_ADMIN_REQUIRED',
				message:
					'Only community admins can invite people to this community.',
			});
		}

		await this.assertConnected(viewerId, userIds);

		const existing = await this.members.find({
			where: { communityId: id, userId: In(userIds) },
			select: { id: true, userId: true },
		});
		const memberIds = new Set(existing.map((row) => row.userId));
		const candidates = userIds.filter((userId) => !memberIds.has(userId));

		if (candidates.length === 0) return;

		const result = await this.invites
			.createQueryBuilder()
			.insert()
			.into(CommunityInvite)
			.values(
				candidates.map((userId) => ({
					communityId: id,
					userId,
					invitedById: viewerId,
				})),
			)
			.orIgnore()
			.returning(['userId'])
			.execute();
		const invited = (result.raw as { userId: string }[]).map(
			(row) => row.userId,
		);

		await this.notifyInvitees(viewerId, id, invited);
	}

	async listInvitable(
		viewerId: string,
		id: string,
		query: ListInvitableQueryDto,
	): Promise<InvitableConnectionPageDto> {
		const access = await this.access(viewerId, id);

		if (!access.canView) throw this.notFound();

		const usersQuery = this.dataSource
			.getRepository(User)
			.createQueryBuilder('user')
			.leftJoinAndSelect('user.photos', 'photo')
			.where(
				`EXISTS (SELECT 1 FROM "connections" c WHERE c."status" = 'accepted'
					AND ((c."requesterId" = :viewerId AND c."addresseeId" = user.id)
					  OR (c."addresseeId" = :viewerId AND c."requesterId" = user.id)))`,
				{ viewerId },
			)
			.orderBy('user.fullName', 'ASC')
			.addOrderBy('user.id', 'ASC');

		if (query.search) {
			usersQuery.andWhere(
				'(user.fullName ILIKE :search OR user.username ILIKE :search)',
				{ search: `%${escapeLike(query.search)}%` },
			);
		}

		const [users, total] = await usersQuery
			.take(query.limit)
			.skip(query.offset)
			.getManyAndCount();
		const ids = users.map((user) => user.id);
		const [memberRows, inviteRows] = ids.length
			? await Promise.all([
					this.members.find({
						where: { communityId: id, userId: In(ids) },
						select: { id: true, userId: true },
					}),
					this.invites.find({
						where: { communityId: id, userId: In(ids) },
						select: { id: true, userId: true },
					}),
				])
			: [[], []];
		const memberIds = new Set(memberRows.map((row) => row.userId));
		const invitedIds = new Set(inviteRows.map((row) => row.userId));

		return new InvitableConnectionPageDto(
			users.map(
				(user) =>
					new InvitableConnectionDto(
						user,
						this.avatarUrl(user),
						memberIds.has(user.id) || access.community.isOfficial
							? InvitableState.Member
							: invitedIds.has(user.id)
								? InvitableState.Invited
								: InvitableState.None,
					),
			),
			new PageInfoDto(total, query),
		);
	}

	/** Membership rows plus the Safety Community, which everyone is in. */
	async countJoined(userId: string): Promise<number> {
		return 1 + (await this.members.count({ where: { userId } }));
	}

	async access(viewerId: string, id: string): Promise<CommunityAccess> {
		const [community, membership, isInvited, viewer] = await Promise.all([
			this.communities.findOne({ where: { id } }),
			this.members.findOne({
				where: { communityId: id, userId: viewerId },
				select: { id: true, isAdmin: true },
			}),
			this.invites.exists({
				where: { communityId: id, userId: viewerId },
			}),
			this.dataSource.getRepository(User).findOne({
				where: { id: viewerId },
				select: { id: true, role: true },
			}),
		]);

		if (!community) throw this.notFound();

		const isPlatformAdmin = viewer?.role === UserRole.Admin;
		const isMember = community.isOfficial || Boolean(membership);
		const isAdmin = community.isOfficial
			? isPlatformAdmin
			: Boolean(membership?.isAdmin);

		return {
			community,
			isMember,
			isAdmin,
			isInvited,
			isPlatformAdmin,
			canView: community.isPublic || isMember || isInvited,
		};
	}

	toPerson(user: User): CommunityPersonDto {
		return new CommunityPersonDto(user, this.avatarUrl(user));
	}

	/**
	 * Counts, faces and the viewer's standing for a page of communities, in a
	 * fixed number of queries however long the page is.
	 */
	private async summaries(
		rows: Community[],
		viewerId: string,
	): Promise<CommunitySummaryDto[]> {
		if (rows.length === 0) return [];

		const ids = rows.map((row) => row.id);
		const hasOfficial = rows.some((row) => row.isOfficial);
		const [counts, faces, mine, invited, safety] = await Promise.all([
			this.members
				.createQueryBuilder('member')
				.select('member.communityId', 'communityId')
				.addSelect('COUNT(*)', 'count')
				.where({ communityId: In(ids) })
				.groupBy('member.communityId')
				.getRawMany<{ communityId: string; count: string }>(),
			this.dataSource.query<{ communityId: string; userId: string }[]>(
				`SELECT "communityId", "userId" FROM (
					SELECT m."communityId", m."userId",
						ROW_NUMBER() OVER (PARTITION BY m."communityId" ORDER BY m."isAdmin" DESC, m."createdAt") AS rank
					FROM "community_members" m
					WHERE m."communityId" = ANY($1)
				) ranked WHERE rank <= $2`,
				[ids, COMMUNITY_FACES],
			),
			this.members.find({
				where: { communityId: In(ids), userId: viewerId },
				select: { id: true, communityId: true, isAdmin: true },
			}),
			this.invites.find({
				where: { communityId: In(ids), userId: viewerId },
				select: { id: true, communityId: true },
			}),
			hasOfficial ? this.safetySummary() : null,
		]);
		const faceUserIds = [...new Set(faces.map((row) => row.userId))];
		const [users, viewer] = await Promise.all([
			faceUserIds.length
				? this.dataSource.getRepository(User).find({
						where: { id: In(faceUserIds) },
						relations: { photos: true },
						select: PERSON_SELECT,
					})
				: [],
			this.dataSource.getRepository(User).findOne({
				where: { id: viewerId },
				select: { id: true, role: true },
			}),
		]);
		const userById = new Map(users.map((user) => [user.id, user]));
		const countById = new Map(
			counts.map((row) => [row.communityId, Number(row.count)]),
		);
		const membershipById = new Map(
			mine.map((row) => [row.communityId, row]),
		);
		const invitedIds = new Set(invited.map((row) => row.communityId));
		const isPlatformAdmin = viewer?.role === UserRole.Admin;

		return rows.map((row) => {
			const membership = membershipById.get(row.id);
			const viewerState: CommunityViewerDto = {
				isMember: row.isOfficial || Boolean(membership),
				isAdmin: row.isOfficial
					? isPlatformAdmin
					: Boolean(membership?.isAdmin),
				isInvited: invitedIds.has(row.id),
				canLeave: !row.isOfficial && Boolean(membership),
			};
			const memberPreview =
				row.isOfficial && safety
					? safety.faces
					: faces
							.filter((face) => face.communityId === row.id)
							.map((face) => userById.get(face.userId))
							.filter((user): user is User => Boolean(user))
							.map((user) => this.toPerson(user));

			return new CommunitySummaryDto(row, {
				coverUrl: row.coverStorageId
					? this.storage.buildUrl(row.coverStorageId, 'full')
					: null,
				memberCount:
					row.isOfficial && safety
						? safety.count
						: (countById.get(row.id) ?? 0),
				memberPreview,
				viewer: viewerState,
			});
		});
	}

	/** Its faces are the most recently active members who have a photo. */
	private async safetySummary(): Promise<{
		count: number;
		faces: CommunityPersonDto[];
	}> {
		const users = this.dataSource.getRepository(User);
		const [count, recent] = await Promise.all([
			users
				.createQueryBuilder('user')
				.where(SAFETY_MEMBERS.clause, SAFETY_MEMBERS.params)
				.getCount(),
			users
				.createQueryBuilder('user')
				.innerJoinAndSelect(
					'user.photos',
					'photo',
					'photo.position = :avatar',
					{ avatar: AVATAR_POSITION },
				)
				.where(SAFETY_MEMBERS.clause, SAFETY_MEMBERS.params)
				.orderBy('user.lastActiveAt', 'DESC', 'NULLS LAST')
				.take(COMMUNITY_FACES)
				.getMany(),
		]);

		return { count, faces: recent.map((user) => this.toPerson(user)) };
	}

	private async adminAccess(
		viewerId: string,
		id: string,
	): Promise<CommunityAccess> {
		const access = await this.access(viewerId, id);

		if (!access.canView) throw this.notFound();

		if (!access.isAdmin) {
			throw new ForbiddenException({
				code: 'COMMUNITY_ADMIN_REQUIRED',
				message: 'Only community admins can do that.',
			});
		}

		return access;
	}

	/** Runs inside the leave transaction, against its repository. */
	private async ensureAdmin(
		members: Repository<CommunityMember>,
		communityId: string,
	): Promise<void> {
		const hasAdmin = await members.exists({
			where: { communityId, isAdmin: true },
		});

		if (hasAdmin) return;

		const successor = await members.findOne({
			where: { communityId },
			order: { createdAt: 'ASC' },
			select: { id: true },
		});

		if (successor) await members.update(successor.id, { isAdmin: true });
	}

	private async assertCategory(
		categoryId: string | undefined,
	): Promise<void> {
		if (!categoryId) return;

		const exists = await this.categories.exists({
			where: { id: categoryId, isActive: true },
		});

		if (!exists) {
			throw new BadRequestException({
				code: 'CATEGORY_NOT_FOUND',
				message: 'That category is not available.',
			});
		}
	}

	private async assertCover(
		userId: string,
		storageId: string | undefined,
	): Promise<void> {
		if (!storageId) return;

		if (!this.storage.isCommunityStorageId(storageId, userId, 'cover')) {
			throw new BadRequestException({
				code: 'UPLOAD_NOT_OWNED',
				message: 'That cover image does not belong to this community.',
			});
		}

		if (!(await this.storage.findAsset(storageId))) {
			throw new BadRequestException({
				code: 'UPLOAD_NOT_FOUND',
				message:
					'The cover image upload did not complete. Please try again.',
			});
		}
	}

	/**
	 * Invitations go to accepted connections only, so a community can never be
	 * used to reach a stranger who has not agreed to hear from the inviter.
	 */
	private async assertConnected(
		viewerId: string,
		userIds: string[],
	): Promise<void> {
		if (userIds.length === 0) return;

		const states = await this.connections.statesFor(viewerId, userIds);

		if (!userIds.every((id) => states.get(id) === 'connected')) {
			throw new BadRequestException({
				code: 'INVITEE_NOT_CONNECTED',
				message: 'You can only invite people you are connected with.',
			});
		}
	}

	/** Best effort, after the invitations are committed. */
	private async notifyInvitees(
		inviterId: string,
		communityId: string,
		userIds: string[],
	): Promise<void> {
		for (const userId of userIds) {
			try {
				const notification = await this.notifications.create({
					userId,
					kind: NotificationKind.CommunityInvite,
					actorId: inviterId,
					subjectId: communityId,
				});

				this.gateway.broadcastNotification(userId, notification);
			} catch (error) {
				this.logger.warn(
					`Could not notify ${userId} of a community invite: ${String(error)}`,
				);
			}
		}
	}

	private avatarUrl(user: User): string | null {
		const avatar = user.photos?.find(
			(photo) => photo.position === AVATAR_POSITION,
		);

		return avatar
			? this.storage.buildUrl(avatar.storageId, 'thumbnail')
			: null;
	}

	private officialLocked(): BadRequestException {
		return new BadRequestException({
			code: 'COMMUNITY_OFFICIAL',
			message:
				'The Safety Community is managed from the admin dashboard.',
		});
	}

	private notFound(): NotFoundException {
		return new NotFoundException({
			code: 'COMMUNITY_NOT_FOUND',
			message: 'That community is no longer available.',
		});
	}
}
