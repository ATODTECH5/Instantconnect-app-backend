import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { IsNull, Repository } from 'typeorm';

import { digestToken, generateOpaqueToken } from '../common/utils/hashing.util';
import type { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { authConfig } from '../config/configuration';
import type { IssuedTokens } from './dto/session-response.dto';
import { RefreshToken } from './entities/refresh-token.entity';
import type { AccessTokenPayload, SessionContext } from './token-payload';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class TokensService {
  private readonly logger = new Logger(TokensService.name);

  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    @Inject(authConfig.KEY)
    private readonly config: ConfigType<typeof authConfig>,
  ) {}

  async issueSession(
    user: User,
    context: SessionContext,
  ): Promise<IssuedTokens> {
    return this.issue(user, randomUUID(), context);
  }

  /**
   * Rotates a refresh token. A token that was already rotated away means the
   * chain leaked, so the entire family is revoked: the legitimate device is
   * signed out too, which is the correct outcome once a copy is loose.
   */
  async rotate(
    rawToken: string,
    context: SessionContext,
  ): Promise<IssuedTokens> {
    const stored = await this.refreshTokens.findOne({
      where: { tokenHash: digestToken(rawToken) },
    });

    if (!stored) throw this.invalidRefreshToken();

    if (stored.revokedAt) {
      this.logger.warn(
        `Refresh token reuse detected for user ${stored.userId}; revoking family ${stored.familyId}`,
      );
      await this.revokeFamily(stored.familyId);

      throw this.invalidRefreshToken();
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw this.invalidRefreshToken();
    }

    const user = await this.users.findById(stored.userId);

    if (!user) throw this.invalidRefreshToken();

    return this.refreshTokens.manager.transaction(async (manager) => {
      await manager.update(RefreshToken, stored.id, { revokedAt: new Date() });

      // The family keeps its original absolute expiry. Recomputing it from the
      // request would silently downgrade a "keep me signed in" session, since
      // the refresh call carries no such flag, and would let a leaked token be
      // renewed indefinitely.
      return this.issue(
        user,
        stored.familyId,
        context,
        manager.getRepository(RefreshToken),
        stored.expiresAt,
      );
    });
  }

  async revoke(rawToken: string): Promise<void> {
    await this.refreshTokens.update(
      { tokenHash: digestToken(rawToken), revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.refreshTokens.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  private async issue(
    user: User,
    familyId: string,
    context: SessionContext,
    repository: Repository<RefreshToken> = this.refreshTokens,
    inheritedExpiry?: Date,
  ): Promise<IssuedTokens> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwt.signAsync(payload);
    const rawRefreshToken = generateOpaqueToken();
    const ttlDays = context.keepSignedIn
      ? this.config.refreshTtlDays
      : this.config.refreshSessionTtlDays;
    const expiresAt =
      inheritedExpiry ?? new Date(Date.now() + ttlDays * MILLISECONDS_PER_DAY);

    await repository.save(
      repository.create({
        userId: user.id,
        tokenHash: digestToken(rawRefreshToken),
        familyId,
        expiresAt,
        userAgent: context.userAgent,
        ipAddress: context.ipAddress,
      }),
    );

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      accessTokenExpiresIn: this.secondsUntilExpiry(accessToken),
      refreshTokenExpiresAt: expiresAt,
    };
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.refreshTokens.update(
      { familyId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  /** Read back from the signed token so the TTL has exactly one source. */
  private secondsUntilExpiry(accessToken: string): number {
    const { exp } = this.jwt.decode<{ exp: number }>(accessToken);

    return Math.max(0, exp - Math.floor(Date.now() / 1000));
  }

  private invalidRefreshToken(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'INVALID_REFRESH_TOKEN',
      message: 'Your session has expired. Please sign in again.',
    });
  }
}
