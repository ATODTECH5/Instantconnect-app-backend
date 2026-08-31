import { MINIMUM_AGE, ageOn, isCalendarDate } from './age.util';

describe('isCalendarDate', () => {
	it.each(['1998-04-12', '2000-02-29', '1900-01-01'])(
		'accepts %s',
		(value) => {
			expect(isCalendarDate(value)).toBe(true);
		},
	);

	it.each([
		['a day that does not exist', '2003-02-30'],
		['a month that does not exist', '2003-13-01'],
		['a non leap year 29 February', '1900-02-29'],
		['slashes', '1998/04/12'],
		['a single digit month', '1998-4-12'],
		['an empty string', ''],
	])('rejects %s', (_label, value) => {
		expect(isCalendarDate(value)).toBe(false);
	});
});

describe('ageOn', () => {
	it('counts a birthday as reached on the day itself', () => {
		expect(ageOn('2000-06-15', new Date('2020-06-15T00:00:00Z'))).toBe(20);
	});

	it('does not count a birthday the day before', () => {
		expect(ageOn('2000-06-15', new Date('2020-06-14T23:59:59Z'))).toBe(19);
	});

	it('handles a birthday later in the same month', () => {
		expect(ageOn('2000-06-20', new Date('2020-06-01T00:00:00Z'))).toBe(19);
	});

	it('handles a birthday in a later month', () => {
		expect(ageOn('2000-12-01', new Date('2020-01-01T00:00:00Z'))).toBe(19);
	});

	/**
	 * A 29 February birthday has no anniversary in a common year. Counting it as
	 * reached on 1 March is the convention that keeps someone from being a day
	 * short of 18 for three years out of four.
	 */
	it('treats a leap day birthday as passed by 1 March in a common year', () => {
		expect(ageOn('2004-02-29', new Date('2022-03-01T00:00:00Z'))).toBe(18);
		expect(ageOn('2004-02-29', new Date('2022-02-28T00:00:00Z'))).toBe(17);
	});

	it('returns a negative age for a date in the future', () => {
		expect(
			ageOn('2030-01-01', new Date('2026-01-01T00:00:00Z')),
		).toBeLessThan(0);
	});

	it('rejects a value that is not a calendar date', () => {
		expect(() => ageOn('not-a-date')).toThrow(TypeError);
	});

	it('puts someone born exactly MINIMUM_AGE years ago on the right side of the gate', () => {
		const now = new Date('2026-08-30T00:00:00Z');
		const eighteenToday = `${now.getUTCFullYear() - MINIMUM_AGE}-08-30`;

		expect(ageOn(eighteenToday, now)).toBe(MINIMUM_AGE);
	});
});
