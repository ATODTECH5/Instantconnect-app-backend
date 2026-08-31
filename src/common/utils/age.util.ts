/** The floor the app is rated, moderated and legally operated for. */
export const MINIMUM_AGE = 18;

/** A calendar date in `YYYY-MM-DD`, the form a Postgres `date` column reaches the app in. */
export type IsoDate = string;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Rejects the dates the pattern alone accepts, such as 2003-02-30. Round
 * tripping through UTC is the cheapest way to ask Postgres' own question:
 * a date that does not exist normalises to a different one.
 */
export function isCalendarDate(value: string): boolean {
	if (!ISO_DATE.test(value)) return false;

	const parsed = new Date(`${value}T00:00:00Z`);

	return (
		!Number.isNaN(parsed.getTime()) &&
		parsed.toISOString().startsWith(value)
	);
}

/**
 * Whole years elapsed, where a birthday counts only once both the month and the
 * day have passed. The comparison stays on calendar fields rather than on an
 * instant because `dateOfBirth` carries no timezone, and lifting it into one
 * would move a birthday by a day either side of the meridian.
 */
export function ageOn(dateOfBirth: IsoDate, on: Date = new Date()): number {
	const parts = ISO_DATE.exec(dateOfBirth);

	if (!parts) {
		throw new TypeError(`Expected YYYY-MM-DD, received "${dateOfBirth}"`);
	}

	const [, birthYear, birthMonth, birthDay] = parts.map(Number);

	const year = on.getUTCFullYear();
	const month = on.getUTCMonth() + 1;
	const day = on.getUTCDate();

	const hasHadBirthday =
		month > birthMonth || (month === birthMonth && day >= birthDay);

	return year - birthYear - (hasHadBirthday ? 0 : 1);
}
