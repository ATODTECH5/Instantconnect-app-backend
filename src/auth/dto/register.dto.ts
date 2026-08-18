import {
  Equals,
  IsBoolean,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import {
  IsEmailAddress,
  StrippedPhone,
  TrimmedString,
} from '../../common/decorators/validation.decorators';
import { IsStrongPassword } from './strong-password.decorator';

/** Local 0XXXXXXXXXX or international +234XXXXXXXXXX, matching the client's rule. */
const NIGERIAN_PHONE = /^(?:0|\+?234)(?:7[01]|8[01]|9[01])\d{8}$/;

export class RegisterDto {
  @IsString()
  @TrimmedString()
  @MinLength(2, { message: 'Enter your full name' })
  @MaxLength(80, { message: 'Name is too long' })
  @Matches(/^[\p{L}][\p{L}'\-. ]*$/u, {
    message: 'Use letters, spaces, hyphens and apostrophes only',
  })
  fullName: string;

  @IsEmailAddress()
  email: string;

  @IsString()
  @StrippedPhone()
  @Matches(NIGERIAN_PHONE, { message: 'Enter a valid Nigerian phone number' })
  phone: string;

  @IsStrongPassword()
  password: string;

  @IsBoolean()
  @Equals(true, { message: 'Accept the terms to continue' })
  termsAccepted: boolean;
}
