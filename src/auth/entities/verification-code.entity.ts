import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { VerificationPurpose } from './verification-purpose.enum';

/**
 * A six digit code has too little entropy to survive a database leak behind a
 * fast hash, so this one is hashed with argon2 like a password. That rules out
 * lookup by hash, which is why every read is scoped by user and purpose.
 */
@Entity('verification_codes')
@Index('IDX_verification_codes_userId_purpose', ['userId', 'purpose'])
export class VerificationCode extends BaseEntity {
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'FK_verification_codes_userId',
  })
  user: User;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'enum', enum: VerificationPurpose })
  purpose: VerificationPurpose;

  @Column({ length: 255 })
  codeHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  consumedAt: Date | null;

  @Column({ type: 'int', default: 0 })
  attempts: number;
}
