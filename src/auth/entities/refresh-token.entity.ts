import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Stored as a SHA-256 digest rather than argon2: the raw token is 256 bits of
 * randomness, so there is nothing to brute force, and a fast digest is what
 * makes lookup by token possible on every refresh.
 *
 * `familyId` links a rotation chain. Presenting an already rotated token means
 * the chain leaked, so the whole family is revoked rather than just that row.
 */
@Entity('refresh_tokens')
export class RefreshToken extends BaseEntity {
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'FK_refresh_tokens_userId',
  })
  user: User;

  @Index('IDX_refresh_tokens_userId')
  @Column({ type: 'uuid' })
  userId: string;

  @Index('UQ_refresh_tokens_tokenHash', { unique: true })
  @Column({ length: 64 })
  tokenHash: string;

  @Index('IDX_refresh_tokens_familyId')
  @Column({ type: 'uuid' })
  familyId: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userAgent: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;
}
