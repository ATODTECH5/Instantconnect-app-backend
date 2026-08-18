import { UserResponseDto } from '../../users/dto/user-response.dto';
import type { User } from '../../users/entities/user.entity';

export type IssuedTokens = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresAt: Date;
};

export class SessionResponseDto {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires, so the client can refresh ahead of a 401. */
  accessTokenExpiresIn: number;
  refreshTokenExpiresAt: string;
  user: UserResponseDto;

  constructor(tokens: IssuedTokens, user: User) {
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
    this.accessTokenExpiresIn = tokens.accessTokenExpiresIn;
    this.refreshTokenExpiresAt = tokens.refreshTokenExpiresAt.toISOString();
    this.user = new UserResponseDto(user);
  }
}

export class TokenPairResponseDto {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresAt: string;

  constructor(tokens: IssuedTokens) {
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
    this.accessTokenExpiresIn = tokens.accessTokenExpiresIn;
    this.refreshTokenExpiresAt = tokens.refreshTokenExpiresAt.toISOString();
  }
}

export class ResetTokenResponseDto {
  resetToken: string;

  constructor(resetToken: string) {
    this.resetToken = resetToken;
  }
}

export class RegistrationResponseDto {
  email: string;

  constructor(email: string) {
    this.email = email;
  }
}
