import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, type EntityManager, In, Repository } from 'typeorm';

import { BlocksService } from '../blocks/blocks.service';
import { ChatGateway } from '../chat/chat.gateway';
import {
	PageInfoDto,
	type PaginationQueryDto,
} from '../common/dto/pagination.dto';
import { NotificationKind } from '../notifications/entities/notification-kind.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { ContentPolicyService } from '../platform-settings/content-policy.service';
import { Storage } from '../storage/storage';
import { UserRole } from '../users/entities/user-role.enum';
import {
	type CommunityAccess,
	CommunitiesService,
	PERSON_SELECT,
} from './communities.service';
import {
	CommunityCommentDto,
	CommunityCommentPageDto,
	CommunityPostDto,
	CommunityPostPageDto,
	CommunityReplyDto,
	type CreateCommunityCommentDto,
	type CreateCommunityPostDto,
	type ReportCommunityPostDto,
} from './dto/community-post.dto';
import { CommunityCommentLike } from './entities/community-comment-like.entity';
import { CommunityComment } from './entities/community-comment.entity';
import { CommunityMember } from './entities/community-member.entity';
import { CommunityPostLike } from './entities/community-post-like.entity';
import { CommunityPostMute } from './entities/community-post-mute.entity';
import { CommunityPost } from './entities/community-post.entity';
import { CommunityReport } from './entities/community-report.entity';
import { Community } from './entities/community.entity';

type PostAccess = { post: CommunityPost; access: CommunityAccess };

@Injectable()
export class CommunityPostsService {
	private readonly logger = new Logger(CommunityPostsService.name);

	constructor(
		@InjectRepository(CommunityPost)
		private readonly posts: Repository<CommunityPost>,
		@InjectRepository(CommunityComment)
		private readonly comments: Repository<CommunityComment>,
		@InjectRepository(CommunityPostLike)
		private readonly postLikes: Repository<CommunityPostLike>,
		@InjectRepository(CommunityCommentLike)
		private readonly commentLikes: Repository<CommunityCommentLike>,
		@InjectRepository(CommunityPostMute)
		private readonly mutes: Repository<CommunityPostMute>,
		@InjectRepository(CommunityReport)
		private readonly reports: Repository<CommunityReport>,
		@InjectRepository(CommunityMember)
		private readonly members: Repository<CommunityMember>,
		private readonly dataSource: DataSource,
		private readonly communities: CommunitiesService,
		private readonly storage: Storage,
		private readonly blocks: BlocksService,
		private readonly notifications: NotificationsService,
		private readonly gateway: ChatGateway,
		private readonly contentPolicy: ContentPolicyService,
	) {}

	/** Pinned posts first, then newest. Posts by people the viewer blocked are left out. */
	async list(
		viewerId: string,
		communityId: string,
		query: PaginationQueryDto,
	): Promise<CommunityPostPageDto> {
		const access = await this.communities.access(viewerId, communityId);

		if (!access.canView) throw this.communityNotFound();

		const [rows, total] = await this.posts
			.createQueryBuilder('post')
			.innerJoinAndSelect('post.author', 'author')
			.leftJoinAndSelect('author.photos', 'photo')
			.where('post.communityId = :communityId', { communityId })
			.andWhere('post.isHidden = false')
			.andWhere(
				BlocksService.hiddenFromViewerClause('author', 'viewerId'),
			)
			.setParameter('viewerId', viewerId)
			.orderBy('post.isPinned', 'DESC')
			.addOrderBy('post.createdAt', 'DESC')
			.addOrderBy('post.id', 'ASC')
			.take(query.limit)
			.skip(query.offset)
			.getManyAndCount();

		return new CommunityPostPageDto(
			await this.toPostDtos(rows, access, viewerId),
			new PageInfoDto(total, query),
		);
	}

	async findOne(viewerId: string, postId: string): Promise<CommunityPostDto> {
		const { post, access } = await this.visiblePost(viewerId, postId);
		const [dto] = await this.toPostDtos([post], access, viewerId);

		return dto;
	}

	async create(
		viewerId: string,
		communityId: string,
		input: CreateCommunityPostDto,
	): Promise<CommunityPostDto> {
		const access = await this.communities.access(viewerId, communityId);

		if (!access.canView) throw this.communityNotFound();
		this.assertMember(access);

		const body = input.body || null;

		if (!body && !input.mediaStorageId) {
			throw new BadRequestException({
				code: 'VALIDATION_FAILED',
				message: 'Write something or add a photo.',
			});
		}

		await this.contentPolicy.assertAllowed(body);

		if (input.mediaStorageId) {
			await this.assertMedia(viewerId, input.mediaStorageId);
		}

		const postId = await this.dataSource.transaction(async (manager) => {
			const saved = await manager.save(
				manager.create(CommunityPost, {
					communityId,
					authorId: viewerId,
					body,
					mediaStorageId: input.mediaStorageId ?? null,
				}),
			);

			await this.touchCommunity(manager, communityId);

			return saved.id;
		});

		return this.findOne(viewerId, postId);
	}

	async update(
		viewerId: string,
		postId: string,
		body: string,
	): Promise<CommunityPostDto> {
		const { post } = await this.visiblePost(viewerId, postId);

		if (post.authorId !== viewerId) {
			throw new ForbiddenException({
				code: 'COMMUNITY_POST_NOT_YOURS',
				message: 'Only the author can edit a post.',
			});
		}

		await this.contentPolicy.assertAllowed(body);
		await this.posts.update(post.id, { body, editedAt: new Date() });

		return this.findOne(viewerId, postId);
	}

	async remove(viewerId: string, postId: string): Promise<void> {
		const { post, access } = await this.visiblePost(viewerId, postId);

		if (post.authorId !== viewerId && !access.isAdmin) {
			throw new ForbiddenException({
				code: 'COMMUNITY_POST_NOT_YOURS',
				message:
					'Only the author or a community admin can delete a post.',
			});
		}

		await this.posts.delete(post.id);
	}

	/** Idempotent both ways; the count moves only when the like row does. */
	async setLiked(
		viewerId: string,
		postId: string,
		liked: boolean,
	): Promise<CommunityPostDto> {
		await this.visiblePost(viewerId, postId);

		await this.dataSource.transaction(async (manager) => {
			const changed = liked
				? await this.insertIgnoring(manager, CommunityPostLike, {
						postId,
						userId: viewerId,
					})
				: ((
						await manager.delete(CommunityPostLike, {
							postId,
							userId: viewerId,
						})
					).affected ?? 0) > 0;

			if (changed) {
				await manager.increment(
					CommunityPost,
					{ id: postId },
					'likeCount',
					liked ? 1 : -1,
				);
			}
		});

		return this.findOne(viewerId, postId);
	}

	async setPinned(
		viewerId: string,
		postId: string,
		pinned: boolean,
	): Promise<CommunityPostDto> {
		const { access } = await this.visiblePost(viewerId, postId);

		if (!access.isAdmin) {
			throw new ForbiddenException({
				code: 'COMMUNITY_ADMIN_REQUIRED',
				message: 'Only community admins can pin posts.',
			});
		}

		await this.posts.update(postId, { isPinned: pinned });

		return this.findOne(viewerId, postId);
	}

	async setMuted(
		viewerId: string,
		postId: string,
		muted: boolean,
	): Promise<CommunityPostDto> {
		await this.visiblePost(viewerId, postId);

		if (muted) {
			await this.insertIgnoring(
				this.dataSource.manager,
				CommunityPostMute,
				{
					postId,
					userId: viewerId,
				},
			);
		} else {
			await this.mutes.delete({ postId, userId: viewerId });
		}

		return this.findOne(viewerId, postId);
	}

	/** Reporting twice is one report. Authors cannot report themselves. */
	async report(
		viewerId: string,
		postId: string,
		input: ReportCommunityPostDto,
	): Promise<void> {
		const { post } = await this.visiblePost(viewerId, postId);

		if (post.authorId === viewerId) {
			throw new BadRequestException({
				code: 'COMMUNITY_REPORT_OWN_POST',
				message: 'You cannot report your own post.',
			});
		}

		await this.insertIgnoring(this.dataSource.manager, CommunityReport, {
			postId,
			reporterId: viewerId,
			reason: input.reason,
			details: input.details || null,
		});
	}

	/** Top level comments page by page, oldest first, each with all its replies. */
	async listComments(
		viewerId: string,
		postId: string,
		query: PaginationQueryDto,
	): Promise<CommunityCommentPageDto> {
		const { access } = await this.visiblePost(viewerId, postId);
		const visible = (alias: string) =>
			this.comments
				.createQueryBuilder(alias)
				.innerJoinAndSelect(`${alias}.author`, 'author')
				.leftJoinAndSelect('author.photos', 'photo')
				.where(`${alias}.postId = :postId`, { postId })
				.andWhere(
					BlocksService.hiddenFromViewerClause('author', 'viewerId'),
				)
				.setParameter('viewerId', viewerId);

		const [topLevel, total] = await visible('comment')
			.andWhere('comment.parentId IS NULL')
			.orderBy('comment.createdAt', 'ASC')
			.addOrderBy('comment.id', 'ASC')
			.take(query.limit)
			.skip(query.offset)
			.getManyAndCount();
		const replies = topLevel.length
			? await visible('reply')
					.andWhere('reply.parentId IN (:...parentIds)', {
						parentIds: topLevel.map((comment) => comment.id),
					})
					.orderBy('reply.createdAt', 'ASC')
					.getMany()
			: [];
		const all = [...topLevel, ...replies];
		const [liked, admins] = await Promise.all([
			all.length
				? this.commentLikes.find({
						where: {
							commentId: In(all.map((comment) => comment.id)),
							userId: viewerId,
						},
						select: { id: true, commentId: true },
					})
				: [],
			this.adminAuthorIds(
				access,
				all.map((comment) => comment.author),
			),
		]);
		const likedIds = new Set(liked.map((row) => row.commentId));
		const toReply = (comment: CommunityComment) =>
			new CommunityReplyDto(comment, {
				author: this.communities.toPerson(comment.author),
				authorIsAdmin: admins.has(comment.authorId),
				hasLiked: likedIds.has(comment.id),
				canDelete: comment.authorId === viewerId || access.isAdmin,
			});

		return new CommunityCommentPageDto(
			topLevel.map(
				(comment) =>
					new CommunityCommentDto(
						comment,
						{
							author: this.communities.toPerson(comment.author),
							authorIsAdmin: admins.has(comment.authorId),
							hasLiked: likedIds.has(comment.id),
							canDelete:
								comment.authorId === viewerId || access.isAdmin,
						},
						replies
							.filter((reply) => reply.parentId === comment.id)
							.map(toReply),
					),
			),
			new PageInfoDto(total, query),
		);
	}

	/**
	 * A reply to a reply attaches to the top level comment, keeping threads one
	 * level deep. The post's author hears about comments and the parent's
	 * author about replies, unless they muted the post or either side blocked
	 * the other.
	 */
	async createComment(
		viewerId: string,
		postId: string,
		input: CreateCommunityCommentDto,
	): Promise<CommunityReplyDto> {
		const { post, access } = await this.visiblePost(viewerId, postId);

		this.assertMember(access);
		await this.contentPolicy.assertAllowed(input.body);

		const parent = input.parentId
			? await this.comments.findOne({
					where: { id: input.parentId, postId },
					select: { id: true, parentId: true, authorId: true },
				})
			: null;

		if (input.parentId && !parent) {
			throw new NotFoundException({
				code: 'COMMUNITY_COMMENT_NOT_FOUND',
				message: 'That comment is no longer available.',
			});
		}

		const threadParentId = parent ? (parent.parentId ?? parent.id) : null;
		const saved = await this.dataSource.transaction(async (manager) => {
			const comment = await manager.save(
				manager.create(CommunityComment, {
					postId,
					authorId: viewerId,
					parentId: threadParentId,
					body: input.body,
				}),
			);

			await manager.increment(
				CommunityPost,
				{ id: postId },
				'commentCount',
				1,
			);
			await this.touchCommunity(manager, post.communityId);

			return comment;
		});

		if (parent) {
			await this.notify(
				parent.authorId,
				NotificationKind.CommunityReply,
				viewerId,
				postId,
			);
		}

		if (!parent || parent.authorId !== post.authorId) {
			await this.notify(
				post.authorId,
				NotificationKind.CommunityComment,
				viewerId,
				postId,
			);
		}

		const withAuthor = await this.comments.findOneOrFail({
			where: { id: saved.id },
			relations: { author: { photos: true } },
			select: {
				id: true,
				createdAt: true,
				authorId: true,
				body: true,
				likeCount: true,
				author: PERSON_SELECT,
			},
		});
		const admins = await this.adminAuthorIds(access, [withAuthor.author]);

		return new CommunityReplyDto(withAuthor, {
			author: this.communities.toPerson(withAuthor.author),
			authorIsAdmin: admins.has(viewerId),
			hasLiked: false,
			canDelete: true,
		});
	}

	/** Removing a top level comment takes its replies, and the count drops by all of them. */
	async removeComment(viewerId: string, commentId: string): Promise<void> {
		const comment = await this.comments.findOne({
			where: { id: commentId },
			select: { id: true, postId: true, authorId: true, parentId: true },
		});

		if (!comment) throw this.commentNotFound();

		const { access } = await this.visiblePost(viewerId, comment.postId);

		if (comment.authorId !== viewerId && !access.isAdmin) {
			throw new ForbiddenException({
				code: 'COMMUNITY_COMMENT_NOT_YOURS',
				message:
					'Only the author or a community admin can delete a comment.',
			});
		}

		await this.dataSource.transaction(async (manager) => {
			const replies = comment.parentId
				? 0
				: await manager.count(CommunityComment, {
						where: { parentId: comment.id },
					});

			await manager.delete(CommunityComment, comment.id);
			await manager.decrement(
				CommunityPost,
				{ id: comment.postId },
				'commentCount',
				1 + replies,
			);
		});
	}

	async setCommentLiked(
		viewerId: string,
		commentId: string,
		liked: boolean,
	): Promise<void> {
		const comment = await this.comments.findOne({
			where: { id: commentId },
			select: { id: true, postId: true },
		});

		if (!comment) throw this.commentNotFound();

		await this.visiblePost(viewerId, comment.postId);

		await this.dataSource.transaction(async (manager) => {
			const changed = liked
				? await this.insertIgnoring(manager, CommunityCommentLike, {
						commentId,
						userId: viewerId,
					})
				: ((
						await manager.delete(CommunityCommentLike, {
							commentId,
							userId: viewerId,
						})
					).affected ?? 0) > 0;

			if (changed) {
				await manager.increment(
					CommunityComment,
					{ id: commentId },
					'likeCount',
					liked ? 1 : -1,
				);
			}
		});
	}

	/**
	 * The gate for every post action: the community must be visible, the post
	 * not removed by an admin, and its author not blocked either way.
	 */
	private async visiblePost(
		viewerId: string,
		postId: string,
	): Promise<PostAccess> {
		const post = await this.posts.findOne({
			where: { id: postId },
			relations: { author: { photos: true } },
			select: {
				id: true,
				createdAt: true,
				communityId: true,
				authorId: true,
				body: true,
				mediaStorageId: true,
				isPinned: true,
				editedAt: true,
				likeCount: true,
				commentCount: true,
				isHidden: true,
				author: PERSON_SELECT,
			},
		});

		if (!post || post.isHidden) throw this.postNotFound();

		const [access, isBlocked] = await Promise.all([
			this.communities.access(viewerId, post.communityId),
			post.authorId === viewerId
				? false
				: this.blocks.isBlockedEitherWay(viewerId, post.authorId),
		]);

		if (!access.canView || isBlocked) throw this.postNotFound();

		return { post, access };
	}

	private async toPostDtos(
		rows: CommunityPost[],
		access: CommunityAccess,
		viewerId: string,
	): Promise<CommunityPostDto[]> {
		if (rows.length === 0) return [];

		const ids = rows.map((row) => row.id);
		const [liked, muted, admins] = await Promise.all([
			this.postLikes.find({
				where: { postId: In(ids), userId: viewerId },
				select: { id: true, postId: true },
			}),
			this.mutes.find({
				where: { postId: In(ids), userId: viewerId },
				select: { id: true, postId: true },
			}),
			this.adminAuthorIds(
				access,
				rows.map((row) => row.author),
			),
		]);
		const likedIds = new Set(liked.map((row) => row.postId));
		const mutedIds = new Set(muted.map((row) => row.postId));

		return rows.map(
			(row) =>
				new CommunityPostDto(row, {
					author: this.communities.toPerson(row.author),
					authorIsAdmin: admins.has(row.authorId),
					mediaUrl: row.mediaStorageId
						? this.storage.buildUrl(row.mediaStorageId, 'full')
						: null,
					viewer: {
						hasLiked: likedIds.has(row.id),
						isMuted: mutedIds.has(row.id),
						canEdit: row.authorId === viewerId,
						canDelete: row.authorId === viewerId || access.isAdmin,
						canPin: access.isAdmin,
						canReport: row.authorId !== viewerId,
					},
				}),
		);
	}

	/** In the Safety Community the admins are the platform's own team. */
	private async adminAuthorIds(
		access: CommunityAccess,
		authors: { id: string; role: UserRole }[],
	): Promise<Set<string>> {
		if (authors.length === 0) return new Set();

		if (access.community.isOfficial) {
			return new Set(
				authors
					.filter((author) => author.role === UserRole.Admin)
					.map((author) => author.id),
			);
		}

		const rows = await this.members.find({
			where: {
				communityId: access.community.id,
				userId: In([...new Set(authors.map((author) => author.id))]),
				isAdmin: true,
			},
			select: { id: true, userId: true },
		});

		return new Set(rows.map((row) => row.userId));
	}

	private assertMember(access: CommunityAccess): void {
		if (!access.isMember) {
			throw new ForbiddenException({
				code: 'COMMUNITY_MEMBERSHIP_REQUIRED',
				message: 'Join this community to post or comment.',
			});
		}
	}

	private async assertMedia(
		userId: string,
		storageId: string,
	): Promise<void> {
		if (!this.storage.isCommunityStorageId(storageId, userId, 'post')) {
			throw new BadRequestException({
				code: 'UPLOAD_NOT_OWNED',
				message: 'That photo does not belong to this post.',
			});
		}

		if (!(await this.storage.findAsset(storageId))) {
			throw new BadRequestException({
				code: 'UPLOAD_NOT_FOUND',
				message: 'The photo upload did not complete. Please try again.',
			});
		}
	}

	private async touchCommunity(
		manager: EntityManager,
		communityId: string,
	): Promise<void> {
		await manager.update(
			Community,
			{ id: communityId },
			{ lastActivityAt: new Date() },
		);
	}

	/** Whether a row was written; a duplicate under the unique pair writes nothing. */
	private async insertIgnoring<T extends object>(
		manager: EntityManager,
		target: new () => T,
		values: Partial<T>,
	): Promise<boolean> {
		const result = await manager
			.createQueryBuilder()
			.insert()
			.into(target)
			.values(values as never)
			.orIgnore()
			.execute();

		return (result.raw as unknown[]).length > 0;
	}

	/** Never throws: the comment it follows is already committed. */
	private async notify(
		userId: string,
		kind: NotificationKind,
		actorId: string,
		postId: string,
	): Promise<void> {
		if (userId === actorId) return;

		try {
			const [isMuted, isBlocked] = await Promise.all([
				this.mutes.exists({ where: { postId, userId } }),
				this.blocks.isBlockedEitherWay(userId, actorId),
			]);

			if (isMuted || isBlocked) return;

			const notification = await this.notifications.create({
				userId,
				kind,
				actorId,
				subjectId: postId,
			});

			this.gateway.broadcastNotification(userId, notification);
		} catch (error) {
			this.logger.warn(
				`Could not notify ${userId} (${kind}) about post ${postId}: ${String(error)}`,
			);
		}
	}

	private communityNotFound(): NotFoundException {
		return new NotFoundException({
			code: 'COMMUNITY_NOT_FOUND',
			message: 'That community is no longer available.',
		});
	}

	private postNotFound(): NotFoundException {
		return new NotFoundException({
			code: 'COMMUNITY_POST_NOT_FOUND',
			message: 'That post is no longer available.',
		});
	}

	private commentNotFound(): NotFoundException {
		return new NotFoundException({
			code: 'COMMUNITY_COMMENT_NOT_FOUND',
			message: 'That comment is no longer available.',
		});
	}
}
