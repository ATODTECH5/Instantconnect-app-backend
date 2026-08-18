import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { Public } from '../common/decorators/public.decorator';
import { EmailDto } from './dto/email.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import {
  RegistrationResponseDto,
  ResetTokenResponseDto,
  SessionResponseDto,
  TokenPairResponseDto,
} from './dto/session-response.dto';
import { SignInDto } from './dto/sign-in.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { AuthService } from './auth.service';
import { Session } from './session-context.decorator';
import type { SessionContext } from './token-payload';

/**
 * Credential guessing and mail flooding are the threat here, but the limits are
 * per IP and most Nigerian mobile traffic arrives through carrier NAT, so a
 * single address can legitimately front many users. These are set loose enough
 * not to lock out a shared IP; per account limits are the tighter control and
 * belong on the account, not here.
 *
 * Sending a code costs real money and lands in someone's inbox, so those stay
 * tight regardless.
 */
const CREDENTIAL_THROTTLE = { default: { limit: 20, ttl: 60_000 } };
const CODE_THROTTLE = { default: { limit: 5, ttl: 300_000 } };

@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Throttle(CREDENTIAL_THROTTLE)
  @Post('register')
  register(@Body() dto: RegisterDto): Promise<RegistrationResponseDto> {
    return this.auth.register(dto);
  }

  @Throttle(CREDENTIAL_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  verifyEmail(
    @Body() dto: VerifyCodeDto,
    @Session() context: SessionContext,
  ): Promise<SessionResponseDto> {
    return this.auth.verifyEmail(dto, context);
  }

  @Throttle(CODE_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('resend-verification')
  resendVerification(@Body() dto: EmailDto): Promise<void> {
    return this.auth.resendVerificationCode(dto);
  }

  @Throttle(CREDENTIAL_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('sign-in')
  signIn(
    @Body() dto: SignInDto,
    @Session() context: SessionContext,
  ): Promise<SessionResponseDto> {
    return this.auth.signIn(dto, context);
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(
    @Body() dto: RefreshTokenDto,
    @Session() context: SessionContext,
  ): Promise<TokenPairResponseDto> {
    return this.auth.refresh(dto.refreshToken, context);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('sign-out')
  signOut(@Body() dto: RefreshTokenDto): Promise<void> {
    return this.auth.signOut(dto.refreshToken);
  }

  @Throttle(CODE_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('forgot-password')
  forgotPassword(@Body() dto: EmailDto): Promise<void> {
    return this.auth.requestPasswordReset(dto);
  }

  @Throttle(CREDENTIAL_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('verify-reset-code')
  async verifyResetCode(
    @Body() dto: VerifyCodeDto,
  ): Promise<ResetTokenResponseDto> {
    return new ResetTokenResponseDto(
      await this.auth.verifyPasswordResetCode(dto),
    );
  }

  @Throttle(CREDENTIAL_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    return this.auth.resetPassword(dto);
  }
}
