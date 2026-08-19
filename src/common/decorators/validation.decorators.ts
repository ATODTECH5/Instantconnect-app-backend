import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';

import { normaliseEmail } from '../utils/normalise.util';

/**
 * Every endpoint that takes an address normalises it the same way, so that
 * `Ada@Example.com ` and `ada@example.com` can never become two accounts.
 * `value` is typed as unknown because a client can send anything at all.
 */
export const IsEmailAddress = () =>
	applyDecorators(
		Transform(({ value }: { value: unknown }) =>
			typeof value === 'string' ? normaliseEmail(value) : value,
		),
		IsEmail({}, { message: 'Enter a valid email address' }),
		MaxLength(255),
	);

export const TrimmedString = () =>
	Transform(({ value }: { value: unknown }) =>
		typeof value === 'string' ? value.trim() : value,
	);

/** Accepts the spacing and bracket styles people actually type phone numbers in. */
export const StrippedPhone = () =>
	Transform(({ value }: { value: unknown }) =>
		typeof value === 'string' ? value.replace(/[\s()-]/g, '') : value,
	);
