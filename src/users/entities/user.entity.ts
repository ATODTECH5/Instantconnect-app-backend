import {
  Column,
  DeleteDateColumn,
  Entity,
  Index,
  JoinTable,
  ManyToMany,
  OneToMany,
} from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { AuthIdentity } from './auth-identity.entity';
import { Interest } from '../../interests/entities/interest.entity';
import { UserRole } from './user-role.enum';
import { UserStatus } from './user-status.enum';

/**
 * Uniqueness is scoped to live rows so that deleting an account frees its email
 * and phone for re-registration instead of permanently reserving them.
 */
@Entity('users')
@Index('UQ_users_email_active', ['email'], {
  unique: true,
  where: '"deletedAt" IS NULL',
})
@Index('UQ_users_phone_active', ['phone'], {
  unique: true,
  where: '"deletedAt" IS NULL',
})
export class User extends BaseEntity {
  @Column({ length: 80 })
  fullName: string;

  /** Always stored lower cased; normalise through `normaliseEmail` on the way in. */
  @Column({ length: 255 })
  email: string;

  /** E.164, as produced by the client's `toE164`. */
  @Column({ length: 20 })
  phone: string;

  /**
   * Null for accounts that only ever signed in through a federated provider.
   * Never selected by default, so it cannot leak through an unguarded find.
   */
  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  passwordHash: string | null;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.User })
  role: UserRole;

  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.PendingVerification,
  })
  status: UserStatus;

  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null;

  /** Records consent for the terms the account was created under. */
  @Column({ type: 'timestamptz' })
  termsAcceptedAt: Date;

  /**
   * The PIN itself never reaches the server: it lives in the device keychain
   * and gates local access to the stored refresh token. This flag only tells
   * the client whether onboarding's PIN step is already done.
   */
  @Column({ default: false })
  pinEnabled: boolean;

  @Column({ default: false })
  biometricsEnabled: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lastSignedInAt: Date | null;

  @DeleteDateColumn({ type: 'timestamptz' })
  deletedAt: Date | null;

  @OneToMany(() => AuthIdentity, (identity) => identity.user)
  identities: AuthIdentity[];

  @ManyToMany(() => Interest)
  @JoinTable({
    name: 'user_interests',
    joinColumn: {
      name: 'userId',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'FK_user_interests_userId',
    },
    inverseJoinColumn: {
      name: 'interestId',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'FK_user_interests_interestId',
    },
  })
  interests: Interest[];

  get isEmailVerified(): boolean {
    return this.emailVerifiedAt !== null;
  }
}
