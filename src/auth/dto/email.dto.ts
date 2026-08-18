import { IsEmailAddress } from '../../common/decorators/validation.decorators';

/** Shared by every endpoint whose whole payload is an address. */
export class EmailDto {
  @IsEmailAddress()
  email: string;
}
