import { describe, expect, it } from 'vitest';
import { coverageReport } from '../src/coverage.js';
import type { Work } from '../src/types.js';

function work(
	id: string,
	artist: string,
	opts: Partial<{ source: Work['source']; year: number; movement: string; culture: string }> = {}
): Work {
	return {
		id,
		source: opts.source ?? 'cma',
		sourceId: id,
		title: `T ${id}`,
		artist: { name: artist, born: null, died: null, nationality: null },
		date: { start: opts.year ?? 1700, end: null, display: String(opts.year ?? 1700) },
		medium: 'Oil on canvas',
		dimensions: null,
		museum: { name: 'M', department: null, accession: null, url: 'https://example.org' },
		rights: { status: 'cc0', attribution: 'CC0' },
		images: {
			aspect: 1.2,
			width: 1500,
			height: 1250,
			thumb: 'https://example.org/t.jpg',
			display: 'https://example.org/d.jpg',
			full: null,
			host: 'museum'
		},
		movement: opts.movement ?? null,
		culture: opts.culture ?? null,
		place: null,
		story: null,
		tags: {},
		quality: { score: 0.7, flags: [] }
	};
}

const noop = (): void => {};

describe('coverageReport (governance)', () => {
	const works = [
		work('a1', 'Vermeer'),
		work('a2', 'Vermeer'),
		work('b1', 'Goya', { movement: 'Romanticism' }),
		work('c1', 'Unknown artist', { culture: 'India' })
	];
	const canon = {
		artists: [
			{ name: 'Vermeer', target: 4 },
			{ name: 'Goya', target: 1 },
			{ name: 'Giotto', target: 6 }
		]
	};

	it('diffs canon targets vs actuals: deficits and absences', () => {
		const r = coverageReport(works, canon, null, noop);
		expect(r.canon?.targetTotal).toBe(11);
		expect(r.canon?.actualTotal).toBe(3);
		expect(r.canon?.absent).toEqual(['Giotto']);
		expect(r.canon?.underTarget).toEqual([{ name: 'Vermeer', target: 4, actual: 2, deficit: 2 }]);
		expect(r.warnings.some((w) => w.includes('spine artists have ZERO works'))).toBe(true);
	});

	it('detects unresolved manual landmarks (artist+title match)', () => {
		const manual = {
			works: [
				{ artist: 'Vermeer', title: 'T a1' },
				{ artist: 'Edward Hopper', title: 'Nighthawks' }
			]
		};
		const r = coverageReport(works, canon, manual, noop);
		expect(r.unresolvedManualWorks).toEqual(['Edward Hopper — Nighthawks']);
	});

	it('reports movement and culture shares and keeps the source warning', () => {
		const r = coverageReport(works, null, null, noop);
		expect(r.canon).toBeNull();
		expect(r.byMovement['Romanticism']).toBe(25);
		expect(r.byCulture['India']).toBe(25);
		// Single-source fixture: cma at 100% triggers the concentration warning.
		expect(r.warnings.some((w) => w.includes('cma'))).toBe(true);
		expect(r.totalWorks).toBe(4);
	});
});
