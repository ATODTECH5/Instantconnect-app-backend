import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import { ChatGateway } from '../chat/chat.gateway';
import {
	generateNumericCode,
	hashSecret,
	verifySecret,
} from '../common/utils/hashing.util';
import { ChatService } from '../chat/chat.service';
import { ConversationParticipant } from '../chat/entities/conversation-participant.entity';
import { MessageKind } from '../chat/entities/message-kind.enum';
import { NotificationKind } from '../notifications/entities/notification-kind.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { DispatchTrigger } from '../safety/entities/safety-dispatch.entity';
import { SafetyService } from '../safety/safety.service';
import { AcceptMeetupDto } from './dto/accept-meetup.dto';
import {
	ArrivalCodeResponseDto,
	MeetupPartyDto,
	MeetupResponseDto,
	VerifyCodeResponseDto,
} from './dto/meetup-response.dto';
import {
	CounterMeetupDto,
	MeetupVenueDto,
	ProposeMeetupDto,
} from './dto/propose-meetup.dto';
import { SetArrivalDto } from './dto/set-arrival.dto';
import { ReportLocationDto, SetLocationSharingDto } from './dto/location.dto';
import { ARRIVAL_CODE_LENGTH, VerifyCodeDto } from './dto/verify-code.dto';
import { ArrivalState, isForwardArrival } from './entities/arrival-state.enum';
import { MeetupParticipant } from './entities/meetup-participant.entity';
import {
	MeetupStatus,
	OPEN_MEETUP_STATUSES,
} from './entities/meetup-status.enum';
import { Meetup } from './entities/meetup.entity';

/**
 * The server owns every transition. The client never writes `status`; it asks
 * for a named action and the guard for that action decides. Each guard reads
 * the row fresh inside a transaction, so two parties acting at once cannot
 * both succeed against a state that only one of them saw.
 *
 * Every transition posts a card into the thread so the flow is visible where
 * the design puts it, and raises a notification for the other party. Both
 * happen after the transaction commits: a card for a rolled-back transition
 * is worse than a late card.
 */
/**
 * A code outlives the scheduled time by this much, so a late arrival can
 * still verify. Issued early, it is valid from issue until then.
 */
const CODE_GRACE_MS = 2 * 60 * 60 * 1000;

/** Wrong guesses at one code before it is burned and must be reissued. */
const MAX_CODE_ATTEMPTS = 5;

@Injectable()
export class MeetupsService {
	private readonly logger = new Logger(MeetupsService.name);

	constructor(
		@InjectRepository(Meetup)
		private readonly meetups: Repository<Meetup>,
		@InjectRepository(MeetupParticipant)
		private readonly parties: Repository<MeetupParticipant>,
		@InjectRepository(ConversationParticipant)
		private readonly threadMembers: Repository<ConversationParticipant>,
		private readonly chat: ChatService,
		private readonly gateway: ChatGateway,
		private readonly notifications: NotificationsService,
		private readonly safety: SafetyService,
		private readonly dataSource: DataSource,
	) {}

	async propose(
		viewerId: string,
		input: ProposeMeetupDto,
	): Promise<MeetupResponseDto> {
		const otherId = await this.otherMemberOrThrow(
			viewerId,
			input.conversationId,
		);
		const proposedTimes = this.futureTimesOrThrow(input.proposedTimes);

		const open = await this.meetups.findOne({
			where: {
				conversationId: input.conversationId,
				status: In(OPEN_MEETUP_STATUSES),
			},
			select: { id: true, status: true },
		});

		if (open) {
			throw new ConflictException({
				code: 'MEETUP_ALREADY_OPEN',
				message:
					open.status === MeetupStatus.Proposed
						? 'There is already a proposal waiting for an answer in this chat.'
						: 'You already have a meetup planned with this person.',
			});
		}

		const meetup = await this.dataSource.transaction(async (manager) => {
			const saved = await manager.save(
				manager.create(Meetup, {
					conversationId: input.conversationId,
					proposerId: viewerId,
					inviteeId: otherId,
					status: MeetupStatus.Proposed,
					awaitingUserId: otherId,
					proposedTimes,
					...this.venueColumns(input.venue),
				}),
			);

			await manager.save([
				manager.create(MeetupParticipant, {
					meetupId: saved.id,
					userId: viewerId,
				}),
				manager.create(MeetupParticipant, {
					meetupId: saved.id,
					userId: otherId,
				}),
			]);

			return saved;
		});

		const full = await this.loadOrThrow(meetup.id);

		await this.announce(full, viewerId, {
			card: MessageKind.Meetup,
			notify: NotificationKind.MeetupProposed,
		});

		return new MeetupResponseDto(full, viewerId);
	}

	async accept(
		viewerId: string,
		meetupId: string,
		input: AcceptMeetupDto,
	): Promise<MeetupResponseDto> {
		const meetup = await this.transition(meetupId, viewerId, (row) => {
			this.mustBeAwaiting(row, viewerId);

			const chosen = new Date(input.scheduledAt);

			if (!row.proposedTimes.includes(chosen.toISOString())) {
				throw new BadRequestException({
					code: 'TIME_NOT_PROPOSED',
					message: 'Pick one of the suggested times.',
				});
			}

			if (chosen.getTime() <= Date.now()) {
				throw new BadRequestException({
					code: 'TIME_IN_PAST',
					message: 'That time has already passed. Suggest another.',
				});
			}

			row.status = MeetupStatus.Scheduled;
			row.scheduledAt = chosen;
			row.awaitingUserId = null;
			row.respondedAt = new Date();
		});

		await this.announce(meetup, viewerId, {
			card: MessageKind.Meetup,
			notify: NotificationKind.MeetupAccepted,
			system: 'You both confirmed! See you there 🎉',
		});

		return new MeetupResponseDto(meetup, viewerId);
	}

	async decline(
		viewerId: string,
		meetupId: string,
	): Promise<MeetupResponseDto> {
		const meetup = await this.transition(meetupId, viewerId, (row) => {
			this.mustBeAwaiting(row, viewerId);

			row.status = MeetupStatus.Declined;
			row.awaitingUserId = null;
			row.respondedAt = new Date();
		});

		await this.announce(meetup, viewerId, {
			card: MessageKind.Meetup,
			notify: NotificationKind.MeetupDeclined,
		});

		return new MeetupResponseDto(meetup, viewerId);
	}

	/**
	 * Replaces the times and hands the question back. The meetup keeps its id
	 * and its proposer, so the thread shows one negotiation rather than a
	 * chain of separate proposals.
	 */
	async counter(
		viewerId: string,
		meetupId: string,
		input: CounterMeetupDto,
	): Promise<MeetupResponseDto> {
		const proposedTimes = this.futureTimesOrThrow(input.proposedTimes);

		const meetup = await this.transition(meetupId, viewerId, (row) => {
			this.mustBeAwaiting(row, viewerId);

			row.proposedTimes = proposedTimes;
			row.awaitingUserId = this.otherOf(row, viewerId);
			row.respondedAt = new Date();
		});

		await this.announce(meetup, viewerId, {
			card: MessageKind.Meetup,
			notify: NotificationKind.MeetupProposed,
		});

		return new MeetupResponseDto(meetup, viewerId);
	}

	/**
	 * While proposed, only the person whose times are on the table may
	 * withdraw them; the other party declines instead. Once scheduled, either
	 * may cancel.
	 */
	async cancel(
		viewerId: string,
		meetupId: string,
	): Promise<MeetupResponseDto> {
		const meetup = await this.transition(meetupId, viewerId, (row) => {
			if (row.status === MeetupStatus.Proposed) {
				if (row.awaitingUserId === viewerId) {
					throw new ForbiddenException({
						code: 'FORBIDDEN',
						message:
							'These times were suggested to you. Decline them instead.',
					});
				}
			} else if (row.status !== MeetupStatus.Scheduled) {
				throw this.wrongState(row, 'cancel');
			}

			row.status = MeetupStatus.Cancelled;
			row.awaitingUserId = null;
			row.cancelledAt = new Date();
			row.cancelledById = viewerId;
		});

		await this.announce(meetup, viewerId, {
			card: MessageKind.Meetup,
			notify: NotificationKind.MeetupCancelled,
		});

		return new MeetupResponseDto(meetup, viewerId);
	}

	async end(viewerId: string, meetupId: string): Promise<MeetupResponseDto> {
		const meetup = await this.transition(meetupId, viewerId, (row) => {
			if (row.status !== MeetupStatus.Active) {
				throw this.wrongState(row, 'end');
			}

			row.status = MeetupStatus.Ended;
			row.endedAt = new Date();
		});

		await this.announce(meetup, viewerId, {
			system: 'Meetup ended. Hope it went well!',
		});
		void this.safety.dispatchForMeetup(meetup, DispatchTrigger.Ended);

		return new MeetupResponseDto(meetup, viewerId);
	}

	/**
	 * Per party, and only forward. Marking arrived does not verify anyone:
	 * verification is the other party confirming the code (step 11), and the
	 * meetup goes active only when both are verified.
	 */
	async setArrival(
		viewerId: string,
		meetupId: string,
		input: SetArrivalDto,
	): Promise<MeetupResponseDto> {
		const meetup = await this.dataSource.transaction(async (manager) => {
			const row = await this.lockedOrThrow(manager, meetupId, viewerId);

			if (
				row.status !== MeetupStatus.Scheduled &&
				row.status !== MeetupStatus.Active
			) {
				throw this.wrongState(row, 'travel to');
			}

			const mine = row.participants.find((p) => p.userId === viewerId);

			if (!mine) throw this.notFound();

			if (!isForwardArrival(mine.arrivalState, input.state)) {
				throw new ConflictException({
					code: 'ARRIVAL_STATE_CONFLICT',
					message: `You are already ${mine.arrivalState.replace('_', ' ')}.`,
				});
			}

			const now = new Date();

			mine.arrivalState = input.state;

			if (input.state === ArrivalState.EnRoute) {
				mine.enRouteAt = now;
			} else {
				mine.enRouteAt ??= now;
				mine.arrivedAt = now;
			}

			await manager.save(mine);

			return row;
		});

		// No card: travel state is shown on the meetup screen, not in the thread.
		this.broadcastState(meetup);

		return new MeetupResponseDto(meetup, viewerId);
	}

	/**
	 * Issues or reissues the viewer's own code. The plain code is returned
	 * exactly once; the row keeps a hash. Reissuing burns the previous code
	 * and resets the other party's attempt count against it.
	 */
	async issueArrivalCode(
		viewerId: string,
		meetupId: string,
	): Promise<ArrivalCodeResponseDto> {
		const code = generateNumericCode(ARRIVAL_CODE_LENGTH);
		const hash = await hashSecret(code);

		const meetup = await this.dataSource.transaction(async (manager) => {
			const row = await this.lockedOrThrow(manager, meetupId, viewerId);

			if (row.status !== MeetupStatus.Scheduled) {
				throw this.wrongState(row, 'get a code for');
			}

			const mine = row.participants.find((p) => p.userId === viewerId);

			if (!mine) throw this.notFound();

			if (mine.verifiedAt !== null) {
				throw new ConflictException({
					code: 'ALREADY_VERIFIED',
					message:
						'The other person has already confirmed you arrived.',
				});
			}

			const base = Math.max(Date.now(), row.scheduledAt?.getTime() ?? 0);

			mine.arrivalCodeHash = hash;
			mine.arrivalCodeExpiresAt = new Date(base + CODE_GRACE_MS);
			mine.arrivalCodeAttempts = 0;

			await manager.save(mine);

			return row;
		});

		this.broadcastState(meetup);

		const mine = meetup.participants.find((p) => p.userId === viewerId)!;

		return new ArrivalCodeResponseDto(
			code,
			mine.arrivalCodeExpiresAt!,
			new MeetupResponseDto(meetup, viewerId),
		);
	}

	/**
	 * The viewer enters the other party's code, which verifies the other
	 * party, not the viewer. A match also marks them arrived, since a code
	 * can only be read off a phone that is present. When both are verified
	 * the meetup becomes active and the thread is told.
	 */
	async verifyArrivalCode(
		viewerId: string,
		meetupId: string,
		input: VerifyCodeDto,
	): Promise<VerifyCodeResponseDto> {
		const outcome = await this.dataSource.transaction(async (manager) => {
			const row = await this.lockedOrThrow(manager, meetupId, viewerId);

			if (row.status !== MeetupStatus.Scheduled) {
				throw this.wrongState(row, 'verify a code for');
			}

			const theirs = row.participants.find((p) => p.userId !== viewerId);

			if (!theirs) throw this.notFound();

			// The hash is select:false, so it is fetched on demand here only.
			const secret = await manager
				.getRepository(MeetupParticipant)
				.createQueryBuilder('p')
				.addSelect('p.arrivalCodeHash')
				.where('p.id = :id', { id: theirs.id })
				.getOne();

			// Checked before the hash: burning a code nulls its hash, and a
			// reissue resets this counter, so a full counter always means locked.
			if (theirs.arrivalCodeAttempts >= MAX_CODE_ATTEMPTS) {
				throw new ConflictException({
					code: 'CODE_LOCKED',
					message:
						'Too many wrong tries. Ask them to get a new code.',
				});
			}

			const hash = secret?.arrivalCodeHash ?? null;
			const expired =
				theirs.arrivalCodeExpiresAt !== null &&
				theirs.arrivalCodeExpiresAt.getTime() <= Date.now();

			if (hash === null || expired) {
				throw new ConflictException({
					code: 'NO_ACTIVE_CODE',
					message: expired
						? 'That code has expired. Ask them to get a new one.'
						: "They haven't got a code yet. Ask them to open the meetup.",
				});
			}

			const matched = await verifySecret(hash, input.code);

			if (!matched) {
				theirs.arrivalCodeAttempts += 1;

				// Burn it at the limit so a later guess cannot land. Below the
				// limit the hash is simply not written: it was never loaded onto
				// this row (select: false), and save() skips undefined columns.
				if (theirs.arrivalCodeAttempts >= MAX_CODE_ATTEMPTS) {
					theirs.arrivalCodeHash = null;
				}

				await manager.save(theirs);

				return {
					verified: false,
					attemptsLeft: Math.max(
						0,
						MAX_CODE_ATTEMPTS - theirs.arrivalCodeAttempts,
					),
					row,
					activated: false,
				};
			}

			const now = new Date();

			theirs.verifiedAt = now;
			theirs.arrivalCodeHash = null;
			theirs.arrivalCodeExpiresAt = null;
			theirs.arrivedAt ??= now;
			theirs.enRouteAt ??= now;
			theirs.arrivalState = ArrivalState.Arrived;

			await manager.save(theirs);

			const mine = row.participants.find((p) => p.userId === viewerId)!;
			const activated = mine.verifiedAt !== null;

			if (activated) {
				row.status = MeetupStatus.Active;
				row.startedAt = now;

				const { participants, ...columns } = row;
				await manager.save(Meetup, columns);
				row.participants = participants;
			}

			return {
				verified: true,
				attemptsLeft: MAX_CODE_ATTEMPTS,
				row,
				activated,
			};
		});

		if (outcome.activated) {
			await this.announce(outcome.row, viewerId, {
				system: "You're both verified. Enjoy the meetup, and stay safe 🛡️",
			});
			// After the announce, and never awaited into the response path's
			// error handling: emails to family must not fail a verification.
			void this.safety.dispatchForMeetup(
				outcome.row,
				DispatchTrigger.Verified,
			);
		} else {
			this.broadcastState(outcome.row);
		}

		return new VerifyCodeResponseDto(
			outcome.verified,
			outcome.attemptsLeft,
			new MeetupResponseDto(outcome.row, viewerId),
		);
	}

	/**
	 * Turning sharing off also drops the last fix, so the other party's map
	 * cannot keep showing where someone was after they chose to stop.
	 */
	async setLocationSharing(
		viewerId: string,
		meetupId: string,
		input: SetLocationSharingDto,
	): Promise<MeetupResponseDto> {
		const meetup = await this.dataSource.transaction(async (manager) => {
			const row = await this.lockedOrThrow(manager, meetupId, viewerId);

			this.mustBeUnderway(row, 'share your location for');

			const mine = row.participants.find((p) => p.userId === viewerId);

			if (!mine) throw this.notFound();

			mine.isSharingLocation = input.enabled;

			if (!input.enabled) {
				mine.lastLocation = null;
				mine.lastLocationAt = null;
			}

			await manager.save(mine);

			return row;
		});

		this.broadcastState(meetup);

		return new MeetupResponseDto(meetup, viewerId);
	}

	/**
	 * One fix in, one fix out to the other party only. Refused while sharing
	 * is off rather than silently dropped, so a client whose toggle and
	 * server state disagree finds out.
	 */
	async reportLocation(
		viewerId: string,
		meetupId: string,
		input: ReportLocationDto,
	): Promise<MeetupPartyDto> {
		const meetup = await this.dataSource.transaction(async (manager) => {
			const row = await this.lockedOrThrow(manager, meetupId, viewerId);

			this.mustBeUnderway(row, 'report a location for');

			const mine = row.participants.find((p) => p.userId === viewerId);

			if (!mine) throw this.notFound();

			if (!mine.isSharingLocation) {
				throw new ConflictException({
					code: 'SHARING_OFF',
					message: 'Turn on live location first.',
				});
			}

			mine.lastLocation = {
				type: 'Point',
				coordinates: [input.longitude, input.latitude],
			};
			mine.lastLocationAt = new Date();

			await manager.save(mine);

			return row;
		});

		const mine = meetup.participants.find((p) => p.userId === viewerId)!;
		const fix = new MeetupPartyDto(mine, meetup);

		this.gateway.broadcastLocation(this.otherOf(meetup, viewerId), {
			meetupId: meetup.id,
			party: fix,
		});

		return fix;
	}

	async get(viewerId: string, meetupId: string): Promise<MeetupResponseDto> {
		const meetup = await this.loadOrThrow(meetupId);

		this.mustBeParty(meetup, viewerId);

		return new MeetupResponseDto(await this.settleExpiry(meetup), viewerId);
	}

	/**
	 * The one open meetup for a thread, or null. The thread header and the
	 * composer read this to know whether to offer "Propose a time".
	 */
	async openForConversation(
		viewerId: string,
		conversationId: string,
	): Promise<MeetupResponseDto | null> {
		await this.otherMemberOrThrow(viewerId, conversationId);

		const meetup = await this.meetups.findOne({
			where: { conversationId, status: In(OPEN_MEETUP_STATUSES) },
			relations: { participants: true },
		});

		if (!meetup) return null;

		const settled = await this.settleExpiry(meetup);

		return OPEN_MEETUP_STATUSES.includes(settled.status)
			? new MeetupResponseDto(settled, viewerId)
			: null;
	}

	/**
	 * Locks the row, applies the guard and mutation, saves. The guard throws
	 * to refuse; anything it does not throw on is committed.
	 */
	private async transition(
		meetupId: string,
		viewerId: string,
		mutate: (row: Meetup) => void,
	): Promise<Meetup> {
		return this.dataSource.transaction(async (manager) => {
			const row = await this.lockedOrThrow(manager, meetupId, viewerId);

			await this.settleExpiry(row, manager);
			mutate(row);

			const { participants, ...columns } = row;
			await manager.save(Meetup, columns);

			row.participants = participants;

			return row;
		});
	}

	private async lockedOrThrow(
		manager: { getRepository: DataSource['getRepository'] },
		meetupId: string,
		viewerId: string,
	): Promise<Meetup> {
		// Participants are loaded separately because `FOR UPDATE` cannot lock
		// across a join with a nullable side.
		const row = await manager
			.getRepository(Meetup)
			.createQueryBuilder('meetup')
			.setLock('pessimistic_write')
			.where('meetup.id = :meetupId', { meetupId })
			.getOne();

		if (!row) throw this.notFound();

		row.participants = await manager
			.getRepository(MeetupParticipant)
			.find({ where: { meetupId } });

		this.mustBeParty(row, viewerId);

		return row;
	}

	/**
	 * A proposal nobody answered before every suggested time passed is
	 * expired on the next read rather than by a job. Cheap, and the only
	 * consumer of the distinction is the card, which is only ever rendered
	 * after a read.
	 */
	private async settleExpiry(
		row: Meetup,
		manager?: { update: DataSource['manager']['update'] },
	): Promise<Meetup> {
		if (row.status !== MeetupStatus.Proposed) return row;

		const latest = Math.max(
			...row.proposedTimes.map((iso) => new Date(iso).getTime()),
		);

		if (latest > Date.now()) return row;

		row.status = MeetupStatus.Expired;
		row.awaitingUserId = null;

		await (manager ?? this.dataSource.manager).update(
			Meetup,
			{ id: row.id, status: MeetupStatus.Proposed },
			{ status: MeetupStatus.Expired, awaitingUserId: null },
		);

		return row;
	}

	/**
	 * Card into the thread, optional system line after it, notification to
	 * the other party, and a state broadcast so any open meetup screen
	 * re-renders. All best effort: the transition has already committed.
	 */
	private async announce(
		meetup: Meetup,
		actorId: string,
		effects: {
			card?: MessageKind.Meetup;
			system?: string;
			notify?: NotificationKind;
		},
	): Promise<void> {
		const otherId = this.otherOf(meetup, actorId);

		try {
			if (effects.card) {
				await this.chat.postMeetupMessage({
					conversationId: meetup.conversationId,
					senderId: actorId,
					meetup,
					kind: MessageKind.Meetup,
				});
			}

			if (effects.system) {
				await this.chat.postMeetupMessage({
					conversationId: meetup.conversationId,
					senderId: actorId,
					meetup,
					kind: MessageKind.System,
					body: effects.system,
				});
			}

			if (effects.notify) {
				const notification = await this.notifications.create({
					userId: otherId,
					kind: effects.notify,
					actorId,
					subjectId: meetup.conversationId,
				});

				this.gateway.broadcastNotification(otherId, notification);
			}
		} catch (error) {
			this.logger.warn(
				`Could not announce meetup ${meetup.id}: ${String(error)}`,
			);
		}

		this.broadcastState(meetup);
	}

	private broadcastState(meetup: Meetup): void {
		for (const party of meetup.participants) {
			this.gateway.broadcastMeetup(
				party.userId,
				new MeetupResponseDto(meetup, party.userId),
			);
		}
	}

	private mustBeParty(meetup: Meetup, viewerId: string): void {
		if (!meetup.participants.some((p) => p.userId === viewerId)) {
			// Not-found rather than forbidden, so an id cannot be probed.
			throw this.notFound();
		}
	}

	private mustBeUnderway(row: Meetup, verb: string): void {
		if (
			row.status !== MeetupStatus.Scheduled &&
			row.status !== MeetupStatus.Active
		) {
			throw this.wrongState(row, verb);
		}
	}

	private mustBeAwaiting(row: Meetup, viewerId: string): void {
		if (row.status !== MeetupStatus.Proposed) {
			throw this.wrongState(row, 'answer');
		}

		if (row.awaitingUserId !== viewerId) {
			throw new ForbiddenException({
				code: 'FORBIDDEN',
				message: "It's the other person's turn to answer.",
			});
		}
	}

	private wrongState(row: Meetup, verb: string): ConflictException {
		return new ConflictException({
			code: 'MEETUP_STATE_CONFLICT',
			message: `You can't ${verb} a meetup that is ${row.status}.`,
		});
	}

	private notFound(): NotFoundException {
		return new NotFoundException({
			code: 'NOT_FOUND',
			message: 'That meetup does not exist.',
		});
	}

	private async otherMemberOrThrow(
		viewerId: string,
		conversationId: string,
	): Promise<string> {
		const members = await this.threadMembers.find({
			where: { conversationId },
			select: { id: true, userId: true },
		});

		if (!members.some((m) => m.userId === viewerId)) {
			throw new NotFoundException({
				code: 'NOT_FOUND',
				message: 'That conversation does not exist.',
			});
		}

		const other = members.find((m) => m.userId !== viewerId);

		if (!other) {
			throw new ConflictException({
				code: 'RESOURCE_CONFLICT',
				message: 'A meetup needs two people.',
			});
		}

		return other.userId;
	}

	private otherOf(meetup: Meetup, userId: string): string {
		return meetup.proposerId === userId
			? meetup.inviteeId
			: meetup.proposerId;
	}

	/**
	 * Normalised to ISO strings so `accept` can compare by equality. Past
	 * times are rejected here because a proposal that can never be accepted
	 * should not exist.
	 */
	private futureTimesOrThrow(times: string[]): string[] {
		const now = Date.now();
		const normalised = times.map((iso) => new Date(iso));

		if (normalised.some((date) => date.getTime() <= now)) {
			throw new BadRequestException({
				code: 'TIME_IN_PAST',
				message: 'Suggested times have to be in the future.',
			});
		}

		return [...new Set(normalised.map((date) => date.toISOString()))];
	}

	private venueColumns(venue?: MeetupVenueDto): Partial<Meetup> {
		if (!venue) return {};

		const hasPoint =
			venue.latitude !== undefined && venue.longitude !== undefined;

		return {
			venueName: venue.name,
			venueAddress: venue.address ?? null,
			venueLocation: hasPoint
				? {
						type: 'Point',
						coordinates: [venue.longitude!, venue.latitude!],
					}
				: null,
		};
	}

	private async loadOrThrow(meetupId: string): Promise<Meetup> {
		const meetup = await this.meetups.findOne({
			where: { id: meetupId },
			relations: { participants: true },
		});

		if (!meetup) throw this.notFound();

		return meetup;
	}
}
