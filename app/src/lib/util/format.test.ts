import { describe, expect, it } from 'vitest';
import { formatArtistLine, formatYearRange } from './format';

describe('formatYearRange', () => {
	it('formats a single year', () => {
		expect(formatYearRange(1642)).toBe('1642');
	});
	it('formats a range', () => {
		expect(formatYearRange(1503, 1519)).toBe('1503–1519');
	});
	it('collapses identical start/end', () => {
		expect(formatYearRange(1889, 1889)).toBe('1889');
	});
	it('supports circa', () => {
		expect(formatYearRange(1660, null, true)).toBe('c. 1660');
	});
	it('handles BCE', () => {
		expect(formatYearRange(-450)).toBe('450 BCE');
	});
	it('handles missing dates', () => {
		expect(formatYearRange(null)).toBe('date unknown');
	});
});

describe('formatArtistLine', () => {
	it('includes vital dates when known', () => {
		expect(formatArtistLine('Johannes Vermeer', 1632, 1675)).toBe('Johannes Vermeer (1632–1675)');
	});
	it('omits parenthetical when nothing known', () => {
		expect(formatArtistLine('Master of the Embroidered Foliage')).toBe(
			'Master of the Embroidered Foliage'
		);
	});
	it('marks unknown halves', () => {
		expect(formatArtistLine('Anonymous', null, 1520)).toBe('Anonymous (?–1520)');
	});
});
