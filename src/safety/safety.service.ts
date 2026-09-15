import {
	ConflictException,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { Mailer } from '../mail/mailer';
import { MeetupParticipant } from '../meetups/entities/meetup-participant.entity';
import { MeetupStatus } from '../meetups/entities/meetup-status.enum';
import { Meetup } from '../meetups/entities/meetup.entity';
import { User } from '../users/entities/user.entity';
import {
	type CheckInContext,
	checkInEmail,
	checkInPreview,
} from './check-in-email';
import {
	AddMemberDto,
	CircleListResponseDto,
	CircleResponseDto,
	CreateCircleDto,
	DispatchPlanDto,
	DispatchResultDto,
	SelectCirclesDto,
} from './dto/circle.dto';
import { MeetupCircleSelection } from './entities/meetup-circle-selection.entity';
import { SafetyCircleMember } from './entities/safety-circle-member.entity';
import { SafetyCircle } from './entities/safety-circle.entity';
import {
	DispatchStatus,
	DispatchTrigger,
	SafetyDispatch,
} from './entities/safety-dispatch.entity';

/** Enough for family, flatmates and a monitoring contact; not a mailing list. */
const MAX_CIRCLES = 10;
const MAX_MEMBERS = 10;

@Injectable()
export class SafetyService {
	private readonly logger = new Logger(SafetyService.name);

	constructor(
		@InjectRepository(SafetyCircle)
		private readonly circles: Repository<SafetyCircle>,
		@InjectRepository(SafetyCircleMember)
		private readonly members: Repository<SafetyCircleMember>,
		@InjectRepository(MeetupCircleSelection)
		private readonly selections: Repository<MeetupCircleSelection>,
		@InjectRepository(SafetyDispatch)
		private readonly dispatches: Repository<SafetyDispatch>,
		@InjectRepository(MeetupParticipant)
		private readonly participants: Repository<MeetupParticipant>,
		@InjectRepository(User)
		private readonly users: Repository<User>,
		private readonly mailer: Mailer,
	) {}

	async list(ownerId: string): Promise<CircleListResponseDto> {
		const rows = await this.circles.find({
			where: { ownerId },
			relations: { members: true },
			order: { createdAt: 'ASC', members: { createdAt: 'ASC' } },
		});

		return new CircleListResponseDto(
			rows.map((c) => new CircleResponseDto(c)),
		);
	}

	async create(
		ownerId: string,
		input: CreateCircleDto,
	): Promise<CircleResponseDto> {
		const count = await this.circles.count({ where: { ownerId } });

		if (count >= MAX_CIRCLES) {
			throw new ConflictException({
				code: 'CIRCLE_LIMIT',
				message: `You can have up to ${MAX_CIRCLES} circles.`,
			});
		}

		const saved = await this.circles.save(
			this.circles.create({ ownerId, name: input.name }),
		);

		saved.members = [];

		return new CircleResponseDto(saved);
	}

	async remove(ownerId: string, circleId: string): Promise<void> {
		const circle = await this.ownedOrThrow(ownerId, circleId);

		await this.circles.remove(circle);
	}

	async addMember(
		ownerId: string,
		circleId: string,
		input: AddMemberDto,
	): Promise<CircleResponseDto> {
		const circle = await this.ownedOrThrow(ownerId, circleId);

		if (circle.members.length >= MAX_MEMBERS) {
			throw new ConflictException({
				code: 'MEMBER_LIMIT',
				message: `A circle can have up to ${MAX_MEMBERS} people.`,
			});
		}

		if (circle.members.some((m) => m.email === input.email)) {
			throw new ConflictException({
				code: 'MEMBER_EXISTS',
				message: `${input.email} is already in this circle.`,
			});
		}

		await this.members.save(
			this.members.create({
				circleId,
				name: input.name,
				email: input.email,
				phone: input.phone ?? null,
			}),
		);

		return new CircleResponseDto(
			await this.ownedOrThrow(ownerId, circleId),
		);
	}

	async removeMember(
		ownerId: string,
		circleId: string,
		memberId: string,
	): Promise<CircleResponseDto> {
		const circle = await this.ownedOrThrow(ownerId, circleId);
		const member = circle.members.find((m) => m.id === memberId);

		if (!member) throw this.notFound('That contact is not in this circle.');

		await this.members.remove(member);

		return new CircleResponseDto(
			await this.ownedOrThrow(ownerId, circleId),
		);
	}

	/**
	 * Replaces the set wholesale. The client sends what is ticked, not a diff,
	 * so a stale screen cannot leave a circle selected that the user unticked.
	 */
	async selectForMeetup(
		userId: string,
		meetupId: string,
		input: SelectCirclesDto,
	): Promise<string[]> {
		const participant = await this.participantOrThrow(userId, meetupId);

		if (input.circleIds.length > 0) {
			const owned = await this.circles.count({
				where: { id: In(input.circleIds), ownerId: userId },
			});

			if (owned !== new Set(input.circleIds).size) {
				throw this.notFound('One of those circles is not yours.');
			}
		}

		await this.selections.delete({ participantId: participant.id });

		if (input.circleIds.length > 0) {
			await this.selections.save(
				[...new Set(input.circleIds)].map((circleId) =>
					this.selections.create({
						participantId: participant.id,
						circleId,
					}),
				),
			);
		}

		return this.selectedFor(participant.id);
	}

	async planForMeetup(
		userId: string,
		meetupId: string,
	): Promise<DispatchPlanDto> {
		const participant = await this.participantOrThrow(userId, meetupId, {
			relations: { meetup: { participants: true } },
		});
		const [circleIds, ctx] = await Promise.all([
			this.selectedFor(participant.id),
			this.contextFor(participant, 'you'),
		]);
		const trigger =
			participant.meetup.status === MeetupStatus.Active
				? DispatchTrigger.Manual
				: DispatchTrigger.Verified;

		return new DispatchPlanDto(circleIds, checkInPreview(trigger, ctx));
	}

	/** The user's own "send safe check-in" from the meetup screen. */
	async sendManual(
		userId: string,
		meetupId: string,
	): Promise<DispatchResultDto> {
		const participant = await this.participantOrThrow(userId, meetupId, {
			relations: { meetup: { participants: true } },
		});

		if (
			participant.meetup.status !== MeetupStatus.Scheduled &&
			participant.meetup.status !== MeetupStatus.Active
		) {
			throw new ConflictException({
				code: 'MEETUP_STATE_CONFLICT',
				message: 'This meetup is no longer underway.',
			});
		}

		return this.dispatch(participant, DispatchTrigger.Manual);
	}

	/**
	 * Called by the meetups service after a transition commits, for each
	 * participant. Best effort by design: a check-in that fails must never
	 * unwind the verification or the end it describes.
	 */
	async dispatchForMeetup(
		meetup: Meetup,
		trigger: DispatchTrigger,
	): Promise<void> {
		for (const party of meetup.participants) {
			try {
				const participant = await this.participants.findOneOrFail({
					where: { id: party.id },
					relations: { meetup: { participants: true } },
				});

				await this.dispatch(participant, trigger);
			} catch (error) {
				this.logger.warn(
					`Safety dispatch (${trigger}) failed for participant ${party.id}: ${String(error)}`,
				);
			}
		}
	}

	private async dispatch(
		participant: MeetupParticipant,
		trigger: DispatchTrigger,
	): Promise<DispatchResultDto> {
		const circleIds = await this.selectedFor(participant.id);

		if (circleIds.length === 0) return new DispatchResultDto(0, 0, 0);

		const [circles, already, ctx] = await Promise.all([
			this.circles.find({
				where: { id: In(circleIds) },
				relations: { members: true },
			}),
			this.dispatches.find({
				where: {
					participantId: participant.id,
					trigger,
					status: DispatchStatus.Sent,
				},
				select: { id: true, recipientEmail: true },
			}),
			this.contextFor(participant),
		]);

		const reached = new Set(already.map((d) => d.recipientEmail));
		// The same person can be in two circles; they get one email.
		const recipients = new Map<string, SafetyCircleMember>();

		for (const circle of circles) {
			for (const member of circle.members) {
				if (!recipients.has(member.email))
					recipients.set(member.email, member);
			}
		}

		let sent = 0;
		let failed = 0;
		let alreadySent = 0;

		for (const member of recipients.values()) {
			if (reached.has(member.email)) {
				alreadySent += 1;
				continue;
			}

			const email = checkInEmail(trigger, {
				...ctx,
				contactName: member.name,
			});

			let status = DispatchStatus.Sent;

			try {
				await this.mailer.sendSafetyCheckIn(member.email, email);
				sent += 1;
			} catch (error) {
				status = DispatchStatus.Failed;
				failed += 1;
				this.logger.warn(
					`Check-in to ${member.email} failed: ${String(error)}`,
				);
			}

			await this.dispatches.save(
				this.dispatches.create({
					participantId: participant.id,
					trigger,
					recipientEmail: member.email,
					recipientName: member.name,
					status,
				}),
			);
		}

		return new DispatchResultDto(sent, alreadySent, failed);
	}

	/**
	 * Names as the contact will read them. `contactName` is filled per
	 * recipient; the preview uses a placeholder since it is addressed to no one.
	 */
	private async contextFor(
		participant: MeetupParticipant,
		contactName = '',
	): Promise<CheckInContext> {
		const otherId = participant.meetup.participants.find(
			(p) => p.userId !== participant.userId,
		)!.userId;
		const [user, party] = await Promise.all([
			this.users.findOneOrFail({
				where: { id: participant.userId },
				select: { id: true, fullName: true },
			}),
			this.users.findOneOrFail({
				where: { id: otherId },
				select: { id: true, fullName: true },
			}),
		]);

		return {
			userName: user.fullName,
			contactName,
			partyName: party.fullName,
			venueName: participant.meetup.venueName,
			venueAddress: participant.meetup.venueAddress,
			scheduledAt: participant.meetup.scheduledAt,
		};
	}

	private async selectedFor(participantId: string): Promise<string[]> {
		const rows = await this.selections.find({
			where: { participantId },
			select: { id: true, circleId: true },
		});

		return rows.map((r) => r.circleId);
	}

	private async ownedOrThrow(
		ownerId: string,
		circleId: string,
	): Promise<SafetyCircle> {
		const circle = await this.circles.findOne({
			where: { id: circleId, ownerId },
			relations: { members: true },
			order: { members: { createdAt: 'ASC' } },
		});

		if (!circle) throw this.notFound('That circle does not exist.');

		return circle;
	}

	private async participantOrThrow(
		userId: string,
		meetupId: string,
		options: { relations?: { meetup: { participants: boolean } } } = {},
	): Promise<MeetupParticipant> {
		const participant = await this.participants.findOne({
			where: { userId, meetupId },
			relations: options.relations,
		});

		if (!participant) throw this.notFound('That meetup does not exist.');

		return participant;
	}

	private notFound(message: string): NotFoundException {
		return new NotFoundException({ code: 'NOT_FOUND', message });
	}
}
