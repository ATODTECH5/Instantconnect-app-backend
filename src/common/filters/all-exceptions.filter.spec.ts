import {
  ArgumentsHost,
  BadRequestException,
  HttpStatus,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

import { AllExceptionsFilter } from './all-exceptions.filter';

type Captured = {
  status: number;
  body: Record<string, unknown>;
};

function runFilter(exception: unknown): Captured {
  const captured = { status: 0, body: {} };
  const response = {
    status: (code: number) => {
      captured.status = code;

      return {
        json: (payload: Record<string, unknown>) => {
          captured.body = payload;
        },
      };
    },
  };

  const host = {
    switchToHttp: () => ({
      getRequest: () => ({
        id: 'req-1',
        url: '/api/v1/auth/sign-in',
        method: 'POST',
      }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  new AllExceptionsFilter().catch(exception, host);

  return captured;
}

describe('AllExceptionsFilter', () => {
  beforeAll(() => {
    // The filter logs through Nest's Logger, which writes past console.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  it('carries the request id onto the response for correlation', () => {
    const { body } = runFilter(new NotFoundException());

    expect(body.requestId).toBe('req-1');
    expect(body.path).toBe('/api/v1/auth/sign-in');
  });

  it('passes through a machine readable code from the service', () => {
    const { status, body } = runFilter(
      new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'That email and password do not match.',
      }),
    );

    expect(status).toBe(HttpStatus.UNAUTHORIZED);
    expect(body.code).toBe('INVALID_CREDENTIALS');
    expect(body.message).toBe('That email and password do not match.');
  });

  it('falls back to the status name when no code was given', () => {
    const { body } = runFilter(new NotFoundException('Nothing here'));

    expect(body.code).toBe('NOT_FOUND');
    expect(body.message).toBe('Nothing here');
  });

  it('collects ValidationPipe messages into details', () => {
    const { status, body } = runFilter(
      new BadRequestException({
        message: ['Include a number', 'Enter a valid email address'],
      }),
    );

    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.details).toEqual([
      'Include a number',
      'Enter a valid email address',
    ]);
  });

  it('turns a unique violation into a conflict rather than a 500', () => {
    const failure = new QueryFailedError('INSERT', [], new Error('duplicate'));
    (failure as unknown as { driverError: { code: string } }).driverError = {
      code: '23505',
    };

    const { status, body } = runFilter(failure);

    expect(status).toBe(HttpStatus.CONFLICT);
    expect(body.code).toBe('RESOURCE_CONFLICT');
  });

  it('never leaks an internal failure to the client', () => {
    const { status, body } = runFilter(
      new Error('connect ECONNREFUSED 10.0.0.5:5432'),
    );

    expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body.message).toBe('Something went wrong. Please try again.');
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
    expect(body).not.toHaveProperty('stack');
  });
});
