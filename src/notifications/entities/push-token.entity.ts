import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

export enum PushPlatform {
	Ios = 'ios',
	Android = 'android',
}

/**
 * One row per installed app that has agreed to receive pushes. An account can
 * have several (a phone and a tablet), but a token belongs to exactly one
 * account: the token identifies the install, so whoever signed in on it last
 * owns it. Registering a token another account holds moves it rather than
 * duplicating it, which is what keeps the previous user's messages off a
 * shared or handed-down phone.
 */
@Entity('push_tokens')
@Index('IDX_push_tokens_userId', ['userId'])
export class PushToken extends BaseEntity {
	@Column({ type: 'uuid' })
	userId!: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'userId',
		foreignKeyConstraintName: 'FK_push_tokens_userId',
	})
	user!: User;

	/** An Expo push token, `ExponentPushToken[...]`. */
	@Column({ type: 'text', unique: true })
	token!: string;

	@Column({ type: 'enum', enum: PushPlatform })
	platform!: PushPlatform;
}
