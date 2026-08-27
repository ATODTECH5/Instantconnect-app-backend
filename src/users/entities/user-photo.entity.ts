import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { User } from './user.entity';

/** Position 0 is the avatar. 1 to 3 are the gallery slots the edit screen draws. */
export const AVATAR_POSITION = 0;
export const MAX_GALLERY_PHOTOS = 3;
export const MAX_PHOTO_POSITION = AVATAR_POSITION + MAX_GALLERY_PHOTOS;

@Entity('user_photos')
@Unique('UQ_user_photos_user_position', ['userId', 'position'])
export class UserPhoto extends BaseEntity {
	@ManyToOne(() => User, (user) => user.photos, {
		onDelete: 'CASCADE',
		nullable: false,
	})
	@JoinColumn({
		name: 'userId',
		foreignKeyConstraintName: 'FK_user_photos_userId',
	})
	user!: User;

	@Column({ type: 'uuid' })
	userId!: string;

	@Column({ type: 'int' })
	position!: number;

	/**
	 * The provider's handle, and the only address kept. Delivery URLs are derived
	 * from it per size, so moving providers does not strand rows holding a stale
	 * absolute URL, and deleting the row can also delete the file.
	 */
	@Column({ length: 255 })
	storageId!: string;

	get isAvatar(): boolean {
		return this.position === AVATAR_POSITION;
	}
}
