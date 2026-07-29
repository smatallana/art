import { describe, expect, it } from 'vitest';
import type { AppEvent } from './events';
import { explainPair, microInsight, sessionSummary, wantsStrength } from './insight';
import type { OntologyDim } from './profile';
import { testPool, testWork } from './testutil';

const pool = testPool();
const byId = (id: string) => pool.find((w) => w.id === id);

const DIMS: OntologyDim[] = [
	{ id: 'color.saturation', group: 'formal', kind: 'scale', label: 'Saturation', poles: ['muted palettes', 'vivid color'] },
	{ id: 'mood.serenity', group: 'mood', kind: 'intensity', label: 'Serenity' }
];

let seq = 0;
function choice(a: string, b: string, pick: 'a' | 'b' | 'both' | 'neither'): AppEvent {
	return {
		id: `s-${seq++}`,
		at: new Date(1700000000000 + seq * 1000).toISOString(),
		device: 't',
		hour: 12,
		t: 'pair_choice',
		a,
		b,
		pick,
		ms: null
	} as AppEvent;
}

describe('wantsStrength', () => {
	it('asks on informative slots and samples calibration', () => {
		expect(wantsStrength('information', 1)).toBe(true);
		expect(wantsStrength('refutation', 1)).toBe(true);
		expect(wantsStrength('exploration', 1)).toBe(false);
		expect(wantsStrength('challenge', 1)).toBe(false);
		expect(wantsStrength('calibration', 3)).toBe(true);
		expect(wantsStrength('calibration', 4)).toBe(false);
	});
});

describe('explainPair', () => {
	it('names the actually-contrasting dimensions', () => {
		const saturated = pool.find((w) => (w.tags['color.saturation']?.v ?? 0) > 0.7);
		const muted = pool.find((w) => (w.tags['color.saturation']?.v ?? 1) < 0.3);
		if (!saturated || !muted) throw new Error('fixture pool lacks contrast');
		const ex = explainPair(saturated, muted, DIMS);
		expect(ex).not.toBeNull();
		expect(ex?.dimLabels[0]).toBeTruthy();
	});

	it('returns null for a work paired with itself (no honest contrast)', () => {
		const w = testWork('same', {});
		expect(explainPair(w, w, DIMS)).toBeNull();
	});
});

describe('sessionSummary', () => {
	it('finds a planted pattern from consistent choices', () => {
		const saturated = pool.filter((w) => (w.tags['color.saturation']?.v ?? 0) > 0.7);
		const muted = pool.filter((w) => (w.tags['color.saturation']?.v ?? 1) < 0.3);
		const events: AppEvent[] = [];
		for (let i = 0; i < 4 && i < saturated.length && i < muted.length; i++) {
			events.push(choice(saturated[i]!.id, muted[i]!.id, 'a'));
		}
		const s = sessionSummary(events, byId, DIMS);
		expect(s.answered).toBe(4);
		expect(s.patterns.length).toBeGreaterThan(0);
		expect(s.patterns[0]?.label.toLowerCase()).toContain('vivid');
		expect(s.evidenceWorkIds.length).toBeGreaterThan(0);
		const m = microInsight(events, byId, DIMS);
		expect(m?.toLowerCase()).toContain('vivid');
	});

	it('claims nothing from both/neither-only sessions', () => {
		const a = pool[0]!;
		const b = pool[1]!;
		const s = sessionSummary([choice(a.id, b.id, 'both'), choice(a.id, b.id, 'neither')], byId, DIMS);
		expect(s.patterns).toHaveLength(0);
		expect(s.answered).toBe(2);
		expect(microInsight([], byId, DIMS)).toBeNull();
	});
});
