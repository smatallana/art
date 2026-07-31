import { describe, expect, it } from 'vitest';
import type { AppEvent } from './events';
import { createModel } from './model';
import { artistExposure, representativeWorks } from './profile';
import { testWork } from './testutil';

let seq = 0;
function ev(payload: Record<string, unknown>): AppEvent {
	return {
		id: `p-${seq++}`,
		at: new Date(1700000000000 + seq * 1000).toISOString(),
		device: 't',
		hour: 12,
		...payload
	} as AppEvent;
}

describe('representativeWorks', () => {
	const vivid1 = testWork('v1', { artist: 'A', tags: { 'color.saturation': 0.95 } });
	const vivid2 = testWork('v2', { artist: 'B', tags: { 'color.saturation': 0.9 } });
	const vivid3 = testWork('v3', { artist: 'A', tags: { 'color.saturation': 0.85 } }); // same artist as v1
	const muted = testWork('m1', { artist: 'C', tags: { 'color.saturation': 0.1 } });
	const unseen = testWork('u1', { artist: 'D', tags: { 'color.saturation': 1 } });
	const pool = [vivid1, vivid2, vivid3, muted, unseen];
	const byId = (id: string) => pool.find((w) => w.id === id);

	function vividModel() {
		const model = createModel();
		model.dims.set('color.saturation', {
			mu: 0.6,
			variance: 0.1,
			n: 10,
			signAgreement: 1,
			provisional: false
		});
		return model;
	}

	const events = [
		ev({ t: 'pair_choice', a: 'v1', b: 'm1', pick: 'a', ms: null }),
		ev({ t: 'pair_choice', a: 'v2', b: 'm1', pick: 'a', ms: null }),
		ev({ t: 'pair_choice', a: 'v3', b: 'm1', pick: 'a', ms: null })
	];

	it('returns only engaged works that embody the top affinity, one per artist', () => {
		const out = representativeWorks(vividModel(), events, byId);
		const ids = out.map((w) => w.id);
		expect(ids).toContain('v1');
		expect(ids).toContain('v2');
		expect(ids).not.toContain('v3'); // artist A already represented by v1
		expect(ids).not.toContain('u1'); // never engaged — must not appear
		expect(ids).not.toContain('m1'); // engaged as the LOSER, embodies nothing
	});

	it('an unsave retracts a work entirely (mirror of discover.likedWorkIds)', () => {
		const withUnsave = [...events, ev({ t: 'save', work: 'v2' }), ev({ t: 'unsave', work: 'v1' })];
		const out = representativeWorks(vividModel(), withUnsave, byId);
		const ids = out.map((w) => w.id);
		expect(ids).not.toContain('v1');
		expect(ids).toContain('v2');
	});

	it('says nothing without established evidence', () => {
		const empty = createModel(); // no dims at all
		expect(representativeWorks(empty, events, byId)).toEqual([]);
	});
});

describe('artistExposure', () => {
	const base = { name: 'X', saves: 0, score: 0.5, seeded: false };
	it('classifies by real encounters and never conflates low exposure with dislike', () => {
		expect(artistExposure({ ...base, wins: 6, losses: 2 })).toBe('well-tested');
		expect(artistExposure({ ...base, wins: 2, losses: 1 })).toBe('lightly-tested');
		expect(artistExposure({ ...base, wins: 0, losses: 2 })).toBe('insufficient');
		expect(artistExposure({ ...base, wins: 0, losses: 0 })).toBe('insufficient');
	});
});
