import { IsString, MinLength } from 'class-validator';

import { IsStrongPassword } from './strong-password.decorator';

export class ResetPasswordDto {
  @IsString()
  @MinLength(1)
  resetToken: string;

  @IsStrongPassword()
  password: string;
}
