import { InterestResponseDto } from '../../interests/dto/interest-response.dto';
import type { User } from '../entities/user.entity';
import type { UserRole } from '../entities/user-role.enum';
import type { UserStatus } from '../entities/user-status.enum';

/**
 * The only shape a user is ever allowed to leave the API in. Built field by
 * field on purpose: adding a column to the entity cannot leak it by accident.
 */
export class UserResponseDto {
  id: string;
  fullName: string;
  firstName: string;
  email: string;
  phone: string;
  role: UserRole;
  status: UserStatus;
  isEmailVerified: boolean;
  pinEnabled: boolean;
  biometricsEnabled: boolean;
  interests: InterestResponseDto[];
  createdAt: string;

  constructor(user: User) {
    this.id = user.id;
    this.fullName = user.fullName;
    this.firstName = user.fullName.split(' ')[0];
    this.email = user.email;
    this.phone = user.phone;
    this.role = user.role;
    this.status = user.status;
    this.isEmailVerified = user.emailVerifiedAt !== null;
    this.pinEnabled = user.pinEnabled;
    this.biometricsEnabled = user.biometricsEnabled;
    this.interests = InterestResponseDto.fromMany(user.interests ?? []);
    this.createdAt = user.createdAt.toISOString();
  }
}
