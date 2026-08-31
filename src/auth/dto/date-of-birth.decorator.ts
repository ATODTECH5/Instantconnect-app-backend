import {
	registerDecorator,
	type ValidationArguments,
	type ValidationOptions,
} from 'class-validator';

import {
	MINIMUM_AGE,
	ageOn,
	isCalendarDate,
} from '../../common/utils/age.util';

/**
 * Nobody alive is older than this, so a typo in the year is caught here rather
 * than surfacing later as a profile claiming to be 900.
 */
const MAXIMUM_AGE = 120;

/**
 * Age is a gate, not a preference: the app arranges meetups between strangers,
 * so an account below {@link MINIMUM_AGE} must never be created. Checking it on
 * the DTO keeps the rule ahead of the write rather than beside it.
 */
export function IsDateOfBirth(options?: ValidationOptions) {
	return (object: object, propertyName: string): void => {
		registerDecorator({
			name: 'isDateOfBirth',
			target: object.constructor,
			propertyName,
			options,
			validator: {
				validate: (value: unknown) => {
					if (typeof value !== 'string' || !isCalendarDate(value)) {
						return false;
					}

					const age = ageOn(value);

					return age >= MINIMUM_AGE && age <= MAXIMUM_AGE;
				},
				defaultMessage: (args?: ValidationArguments) => {
					const value: unknown = args?.value;

					if (typeof value !== 'string' || !isCalendarDate(value)) {
						return 'Enter your date of birth as YYYY-MM-DD';
					}

					const age = ageOn(value);

					if (age < 0) return 'Enter a date in the past';
					if (age < MINIMUM_AGE) {
						return `You must be at least ${MINIMUM_AGE} to use Instant Connect`;
					}

					return 'Enter a valid date of birth';
				},
			},
		});
	};
}
