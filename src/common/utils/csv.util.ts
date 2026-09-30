/**
 * Quotes every cell, and defuses one a spreadsheet would run as a formula,
 * since names, titles and bios are typed by members. A bare number such as a
 * phone cannot execute, so it keeps its leading plus.
 */
export const csvCell = (value: string | number | null): string => {
	const text = value === null ? '' : String(value);
	const isPlainNumber = /^[+-]?[\d\s().]+$/.test(text);
	const safe =
		/^[=+\-@\t\r]/.test(text) && !isPlainNumber ? `'${text}` : text;
	return `"${safe.replace(/"/g, '""')}"`;
};

export const csvLine = (cells: (string | number | null)[]) =>
	`${cells.map(csvCell).join(',')}\r\n`;

export const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&');
