import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

/**
 * Mirrors the client's `features/auth/password-rules.ts`. Both ends have to
 * agree, so the two definitions must be changed together.
 *
 * This is one validator rather than a stack of `@Matches` decorators because
 * class-validator keys constraints by validator name: several `@Matches` on the
 * same property collapse into one, and the user is told about a single unmet
 * rule at a time. Checking them together reports every rule they missed.
 */
const REQUIREMENTS: { label: string; isMet: (value: string) => boolean }[] = [
  { label: 'at least 8 characters', isMet: (value) => value.length >= 8 },
  { label: 'a lowercase letter', isMet: (value) => /[a-z]/.test(value) },
  { label: 'an uppercase letter', isMet: (value) => /[A-Z]/.test(value) },
  { label: 'a number', isMet: (value) => /\d/.test(value) },
];

/** bcrypt's ceiling, kept so a future move off argon2 cannot silently truncate. */
const MAX_LENGTH = 72;

const unmetRequirements = (value: string): string[] =>
  REQUIREMENTS.filter((rule) => !rule.isMet(value)).map((rule) => rule.label);

function describe(missing: string[]): string {
  if (missing.length === 1) return `Use ${missing[0]}`;

  const leading = missing.slice(0, -1).join(', ');

  return `Use ${leading} and ${missing[missing.length - 1]}`;
}

export function IsStrongPassword(options?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'isStrongPassword',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' &&
          value.length <= MAX_LENGTH &&
          unmetRequirements(value).length === 0,
        defaultMessage: (args?: ValidationArguments) => {
          const value: unknown = args?.value;

          if (typeof value !== 'string') return 'Enter a password';
          if (value.length > MAX_LENGTH) return 'Password is too long';

          return describe(unmetRequirements(value));
        },
      },
    });
  };
}
