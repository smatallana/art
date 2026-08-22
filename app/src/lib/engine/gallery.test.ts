import { describe, expect, it } from 'vitest';
import type { AppEvent } from './events';
import { eraCoverage, seenGallery } from './gallery';
import { testWork } from './testutil';

const base = { device: 'd', hour: 10 };
const shown = (i: number, a: string, b: string): AppEvent => ({
	...base,
	id: `s${i}`,
	at: new Date(1700000000000 + i * 1000).toISOString(),
	t: 'pair_shown',
	a,
	b
});
const choice = (
	i: number,
	a: string,
	b: string,
	pick: 'a' | 'b' | 'both' | 'neither'
): AppEvent => ({
	...base,
	id: `c${i}`,
	at: new Date(1700000000000 + i * 1000).toISOString(),
	t: 'pair_choice',
	a,
	b,
	pick,
	ms: null
});

describe('seenGallery', () => {
	it('collects distinct works, newest first, with chosen marks', () => {
		const entries = seenGallery([
			shown(1, 'w1', 'w2'),
			choice(2, 'w1', 'w2', 'a'),
			shown(3, 'w3', 'w4'), // abandoned — still seen
			shown(4, 'w5', 'w6'),
			choice(5, 'w5', 'w6', 'neither')
		]);
		expect(entries.map((e) => e.id)).toEqual(['w5', 'w6', 'w3', 'w4', 'w1', 'w2']);
		const byId = new Map(entries.map((e) => [e.id, e]));
		expect(byId.get('w1')?.chosen).toBe(true); // picked
		expect(byId.get('w2')?.chosen).toBe(false); // passed over
		expect(byId.get('w3')?.chosen).toBe(false); // abandoned
		expect(byId.get('w5')?.chosen).toBe(false); // neither
	});

	it('a chosen mark survives later re-encounters', () => {
		const entries = seenGallery([
			choice(1, 'w1', 'w2', 'b'),
			shown(2, 'w2', 'w3') // consistency re-show later
		]);
		expect(entries.find((e) => e.id === 'w2')?.chosen).toBe(true);
	});
});

describe('eraCoverage', () => {
	it('counts distinct era buckets across seen works', () => {
		const works = new Map([
			['w1', testWork('w1', { year: 1450 })],
			['w2', testWork('w2', { year: 1600 })],
			['w3', testWork('w3', { year: 1880 })]
		]);
		const entries = seenGallery([shown(1, 'w1', 'w2'), shown(2, 'w3', 'w1')]);
		expect(eraCoverage(entries, (id) => works.get(id))).toBe(3);
	});
});
