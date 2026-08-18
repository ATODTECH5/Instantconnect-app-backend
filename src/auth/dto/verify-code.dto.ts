import { IsString, Matches } from 'class-validator';

import { IsEmailAddress } from '../../common/decorators/validation.decorators';

export class VerifyCodeDto {
  @IsEmailAddress()
  email: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'Enter the 6 digit code' })
  code: string;
}
