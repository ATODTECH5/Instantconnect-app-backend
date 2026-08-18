import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

import { IsEmailAddress } from '../../common/decorators/validation.decorators';

export class SignInDto {
  @IsEmailAddress()
  email: string;

  /**
   * Deliberately not checked against the sign up policy: an account made before
   * a policy change must still be able to sign in.
   */
  @IsString()
  @MinLength(1, { message: 'Enter your password' })
  password: string;

  @IsOptional()
  @IsBoolean()
  keepSignedIn?: boolean;
}
