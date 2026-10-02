import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { pushConfig } from '../../config/configuration';
import { NotificationPreference } from '../../settings/entities/notification-preference.entity';
import type { NotificationResponseDto } from '../dto/notification-response.dto';
import { NotificationKind } from '../entities/notification-kind.enum';
import { PushPlatform, PushToken } from '../entities/push-token.entity';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_TIMEOUT_MS = 10_000;

/** Must match the channel the app creates on Android, or the push is dropped. */
export const ANDROID_CHANNEL_ID = 'default';

type PreferenceKey = keyof Pick<
	NotificationPreference,
	'pushMessages' | 'pushNewConnections' | 'pushEventReminders'
>;

/**
 * Which per-topic switch on the Notification settings screen covers a kind.
 * Kinds with no entry are governed by the master switch alone, since the
 * screen offers nothing finer for them.
 */
const PREFERENCE_FOR_KIND: Partial<Record<NotificationKind, PreferenceKey>> = {
	[NotificationKind.Message]: 'pushMessages',
	[NotificationKind.ConnectionRequest]: 'pushNewConnections',
	[NotificationKind.ConnectionAccepted]: 'pushNewConnections',
	[NotificationKind.EventInvite]: 'pushEventReminders',
	[NotificationKind.EventJoined]: 'pushEventReminders',
};

/**
 * A safety check is sent while someone is out meeting a stranger. Letting a
 * settings toggle silence it would turn a preference about noise into a
 * preference about safety, so it ignores every switch.
 */
const ALWAYS_DELIVERED = new Set<NotificationKind>([
	NotificationKind.MeetupSafetyCheck,
]);

type ExpoTicket =
	| { status: 'ok'; id: string }
	| {
			status: 'error';
			message: string;
			details?: { error?: string };
	  };

/**
 * Delivers a notification that has already been stored to every device the
 * account has registered, through Expo's push service rather than APNs and
 * FCM directly: Expo holds those credentials, so the server needs none.
 *
 * Fire and forget by design. A push is a courtesy on top of a row that is
 * already written and already on the socket, so nothing here throws, and the
 * caller never waits on Expo. A queue is the better home once there is more
 * than one instance or retries start to matter; today a lost push costs
 * nothing the bell will not show on the next open.
 */
@Injectable()
export class PushService {
	private readonly logger = new Logger(PushService.name);

	constructor(
		@InjectRepository(PushToken)
		private readonly tokens: Repository<PushToken>,
		@InjectRepository(NotificationPreference)
		private readonly preferences: Repository<NotificationPreference>,
		@Inject(pushConfig.KEY)
		private readonly config: ConfigType<typeof pushConfig>,
	) {}

	/**
	 * Registering a token another account holds moves it to this one. The
	 * token names the install, so the last person to sign in on a phone is
	 * the one it should buzz for.
	 */
	async register(
		userId: string,
		token: string,
		platform: PushPlatform,
	): Promise<void> {
		await this.tokens.upsert({ userId, token, platform }, ['token']);
	}

	/** Scoped to the caller, so one account cannot unregister another's phone. */
	async unregister(userId: string, token: string): Promise<void> {
		await this.tokens.delete({ userId, token });
	}

	async send(
		userId: string,
		notification: NotificationResponseDto,
		badge: number,
	): Promise<void> {
		try {
			if (!(await this.wants(userId, notification.kind))) return;

			const devices = await this.tokens.find({ where: { userId } });

			if (devices.length === 0) return;

			const messages = devices.map((device) => ({
				to: device.token,
				title: notification.title,
				body: notification.body,
				sound: 'default',
				badge,
				priority: 'high',
				channelId: ANDROID_CHANNEL_ID,
				// Enough for the app to open the right screen and mark the row
				// read, mirroring what a tap on the Notifications screen does.
				data: {
					notificationId: notification.id,
					kind: notification.kind,
					subjectId: notification.subjectId,
				},
			}));

			const tickets = await this.post(messages);

			await this.forgetDeadDevices(devices, tickets);
		} catch (error) {
			this.logger.warn(
				`Could not push notification ${notification.id}: ${String(error)}`,
			);
		}
	}

	private async wants(
		userId: string,
		kind: NotificationKind,
	): Promise<boolean> {
		if (ALWAYS_DELIVERED.has(kind)) return true;

		// No row means the screen was never opened, and its defaults are on.
		const preference = await this.preferences.findOne({
			where: { userId },
		});

		if (!preference) return true;
		if (!preference.pushEnabled) return false;

		const key = PREFERENCE_FOR_KIND[kind];

		return key ? preference[key] : true;
	}

	private async post(messages: object[]): Promise<ExpoTicket[]> {
		const response = await fetch(EXPO_PUSH_URL, {
			method: 'POST',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
				...(this.config.expoAccessToken
					? { Authorization: `Bearer ${this.config.expoAccessToken}` }
					: null),
			},
			body: JSON.stringify(messages),
			signal: AbortSignal.timeout(EXPO_TIMEOUT_MS),
		});

		if (!response.ok) {
			throw new Error(
				`Expo answered ${response.status}: ${await response.text()}`,
			);
		}

		const payload = (await response.json()) as { data?: ExpoTicket[] };

		return payload.data ?? [];
	}

	/**
	 * Tickets come back in the order the messages were sent. A device that
	 * uninstalled the app or revoked permission answers DeviceNotRegistered,
	 * and will answer it forever, so its token is dropped rather than retried.
	 *
	 * Receipts, which report failures APNs and FCM only notice later, are not
	 * polled. They would catch the same dead devices a little sooner, at the
	 * cost of a scheduled job this server does not have.
	 */
	private async forgetDeadDevices(
		devices: PushToken[],
		tickets: ExpoTicket[],
	): Promise<void> {
		const dead: string[] = [];

		tickets.forEach((ticket, index) => {
			if (ticket.status !== 'error') return;

			const device = devices[index];

			if (ticket.details?.error === 'DeviceNotRegistered' && device) {
				dead.push(device.token);
				return;
			}

			this.logger.warn(`Expo refused a push: ${ticket.message}`);
		});

		if (dead.length > 0) await this.tokens.delete({ token: In(dead) });
	}
}
