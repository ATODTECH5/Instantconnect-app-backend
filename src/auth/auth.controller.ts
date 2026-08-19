import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
	ApiBadRequestResponse,
	ApiConflictResponse,
	ApiCreatedResponse,
	ApiForbiddenResponse,
	ApiNoContentResponse,
	ApiOkResponse,
	ApiOperation,
	ApiTags,
	ApiTooManyRequestsResponse,
	ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { ApiErrorDto } from '../common/dto/api-error.dto';
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

@ApiTags('Auth')
@ApiBadRequestResponse({ description: 'VALIDATION_FAILED', type: ApiErrorDto })
@ApiTooManyRequestsResponse({ description: 'Rate limited', type: ApiErrorDto })
@Public()
@Controller('auth')
export class AuthController {
	constructor(private readonly auth: AuthService) {}

	@ApiOperation({
		summary: 'Create an account',
		description:
			'Emails a 6 digit code. The account stays unusable until it is verified.',
	})
	@ApiCreatedResponse({ type: RegistrationResponseDto })
	@ApiConflictResponse({
		description: 'EMAIL_TAKEN or PHONE_TAKEN',
		type: ApiErrorDto,
	})
	@Throttle(CREDENTIAL_THROTTLE)
	@Post('register')
	register(@Body() dto: RegisterDto): Promise<RegistrationResponseDto> {
		return this.auth.register(dto);
	}

	@ApiOperation({
		summary: 'Verify an email address',
		description:
			'Consumes the code and returns the first session for the account.',
	})
	@ApiOkResponse({ type: SessionResponseDto })
	@ApiBadRequestResponse({ description: 'INVALID_CODE', type: ApiErrorDto })
	@ApiConflictResponse({
		description: 'EMAIL_ALREADY_VERIFIED',
		type: ApiErrorDto,
	})
	@ApiTooManyRequestsResponse({
		description:
			'TOO_MANY_ATTEMPTS, the code is burned and a new one is needed',
		type: ApiErrorDto,
	})
	@Throttle(CREDENTIAL_THROTTLE)
	@HttpCode(HttpStatus.OK)
	@Post('verify-email')
	verifyEmail(
		@Body() dto: VerifyCodeDto,
		@Session() context: SessionContext,
	): Promise<SessionResponseDto> {
		return this.auth.verifyEmail(dto, context);
	}

	@ApiOperation({ summary: 'Send a fresh verification code' })
	@ApiNoContentResponse({
		description:
			'Always, whether or not the address has an unverified account.',
	})
	@Throttle(CODE_THROTTLE)
	@HttpCode(HttpStatus.NO_CONTENT)
	@Post('resend-verification')
	resendVerification(@Body() dto: EmailDto): Promise<void> {
		return this.auth.resendVerificationCode(dto);
	}

	@ApiOperation({
		summary: 'Sign in',
		description:
			'`keepSignedIn` chooses between a long lived and a single day session.',
	})
	@ApiOkResponse({ type: SessionResponseDto })
	@ApiUnauthorizedResponse({
		description: 'INVALID_CREDENTIALS',
		type: ApiErrorDto,
	})
	@ApiForbiddenResponse({
		description: 'EMAIL_NOT_VERIFIED or ACCOUNT_SUSPENDED',
		type: ApiErrorDto,
	})
	@Throttle(CREDENTIAL_THROTTLE)
	@HttpCode(HttpStatus.OK)
	@Post('sign-in')
	signIn(
		@Body() dto: SignInDto,
		@Session() context: SessionContext,
	): Promise<SessionResponseDto> {
		return this.auth.signIn(dto, context);
	}

	@ApiOperation({
		summary: 'Exchange a refresh token for a new pair',
		description:
			'The old token dies on use. Presenting one twice is treated as theft and revokes every session in the family.',
	})
	@ApiOkResponse({ type: TokenPairResponseDto })
	@ApiUnauthorizedResponse({
		description: 'INVALID_REFRESH_TOKEN',
		type: ApiErrorDto,
	})
	@HttpCode(HttpStatus.OK)
	@Post('refresh')
	refresh(
		@Body() dto: RefreshTokenDto,
		@Session() context: SessionContext,
	): Promise<TokenPairResponseDto> {
		return this.auth.refresh(dto.refreshToken, context);
	}

	@ApiOperation({ summary: 'Revoke one refresh token' })
	@ApiNoContentResponse({
		description: 'Also returned for a token already gone.',
	})
	@HttpCode(HttpStatus.NO_CONTENT)
	@Post('sign-out')
	signOut(@Body() dto: RefreshTokenDto): Promise<void> {
		return this.auth.signOut(dto.refreshToken);
	}

	@ApiOperation({
		summary: 'Start a password reset',
		description:
			'Answers the same either way, since a truthful answer would let anyone enumerate registered addresses.',
	})
	@ApiNoContentResponse({ description: 'Always.' })
	@Throttle(CODE_THROTTLE)
	@HttpCode(HttpStatus.NO_CONTENT)
	@Post('forgot-password')
	forgotPassword(@Body() dto: EmailDto): Promise<void> {
		return this.auth.requestPasswordReset(dto);
	}

	@ApiOperation({
		summary: 'Exchange a reset code for a short lived grant',
		description:
			'The grant proves the code step was cleared, so the raw code never travels on.',
	})
	@ApiOkResponse({ type: ResetTokenResponseDto })
	@ApiBadRequestResponse({ description: 'INVALID_CODE', type: ApiErrorDto })
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

	@ApiOperation({
		summary: 'Set a new password',
		description:
			'Signs every other device out, since a reset usually means the account was at risk.',
	})
	@ApiNoContentResponse({
		description: 'Password changed and all sessions revoked.',
	})
	@ApiUnauthorizedResponse({
		description: 'INVALID_RESET_TOKEN',
		type: ApiErrorDto,
	})
	@Throttle(CREDENTIAL_THROTTLE)
	@HttpCode(HttpStatus.NO_CONTENT)
	@Post('reset-password')
	resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
		return this.auth.resetPassword(dto);
	}
}
