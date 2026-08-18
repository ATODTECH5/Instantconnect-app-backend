import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Seeded lookup table. The primary key is the slug the client already ships in
 * `features/auth/interests.ts`, so the app can post the ids it renders without
 * a translation step.
 */
@Entity('interests')
export class Interest {
  @PrimaryColumn({ length: 32 })
  id: string;

  @Column({ length: 64 })
  label: string;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ default: true })
  isActive: boolean;
}
