import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { AuthProvider } from './auth-provider.enum';
import { User } from './user.entity';

@Entity('auth_identities')
@Unique('UQ_auth_identities_provider_account', [
	'provider',
	'providerAccountId',
])
export class AuthIdentity extends BaseEntity {
	@ManyToOne(() => User, (user) => user.identities, {
		onDelete: 'CASCADE',
		nullable: false,
	})
	@JoinColumn({
		name: 'userId',
		foreignKeyConstraintName: 'FK_auth_identities_userId',
	})
	user!: User;

	@Column({ type: 'uuid' })
	userId!: string;

	@Column({ type: 'enum', enum: AuthProvider })
	provider!: AuthProvider;

	@Column({ length: 255 })
	providerAccountId!: string;

	@Column({ type: 'varchar', length: 255, nullable: true })
	email!: string | null;
}
