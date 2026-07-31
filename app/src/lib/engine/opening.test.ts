import { describe, expect, it } from 'vitest';
import type { CuratedOnboarding } from './curation';
import {
	condMet,
	OPENING_SLOTS,
	selectOpeningPair,
	sideCandidates,
	type SideFilter
} from './opening';
import { historyFromEvents, recordShown } from './selector';
import { testWork } from './testutil';

// A synthetic curated pool that can fill every slot: anchors of both eras,
// clearly tagged sides for each contrast, and stage-2/3 challenge works.
function syntheticSetup() {
	const works = [
		testWork('calm-old', { year: 1600, tags: { 'mood.serenity': 0.8, 'subject.landscape': 0.9 } }),
		testWork('calm-new', { year: 1900, tags: { 'mood.serenity': 0.8, 'subject.marine': 0.8 } }),
		testWork('tense', { year: 1650, tags: { 'mood.drama': 0.8, 'subject.figure': 0.7 } }),
		testWork('human', {
			year: 1700,
			tags: { 'subject.figure': 0.9, 'subject.humanpresence': 0.9 }
		}),
		testWork('atmos', {
			year: 1870,
			tags: { 'subject.landscape': 0.9, 'subject.humanpresence': 0.1 }
		}),
		testWork('smooth', { year: 1500, tags: { 'form.brushwork': 0.15 } }),
		testWork('gestural', { year: 1890, tags: { 'form.brushwork': 0.85 } }),
		testWork('real', { year: 1550, tags: { 'form.stylization': 0.2, 'mood.mystery': 0.1 } }),
		testWork('dream', { year: 1920, tags: { 'form.stylization': 0.8, 'mood.mystery': 0.8 } }),
		testWork('challenge', { year: 1930, tags: { 'form.abstraction': 0.9 } })
	];
	const curated: CuratedOnboarding = {
		version: 1,
		works: [
			{ id: 'calm-old', stage: 1, role: 'anchor' },
			{ id: 'calm-new', stage: 1, role: 'anchor' },
			{ id: 'tense', stage: 1, role: 'anchor' },
			{ id: 'human', stage: 1, role: 'anchor' },
			{ id: 'atmos', stage: 1, role: 'anchor' },
			{ id: 'smooth', stage: 1, role: 'anchor' },
			{ id: 'gestural', stage: 1, role: 'anchor' },
			{ id: 'real', stage: 1, role: 'anchor' },
			{ id: 'dream', stage: 1, role: 'anchor' },
			{ id: 'challenge', stage: 3, role: 'contrast' }
		]
	};
	return { works, curated };
}

describe('condMet', () => {
	const tagged = testWork('t', { tags: { 'mood.serenity': 0.7 } });
	const bare = testWork('b', { tags: {} });

	it('min fails on absent tags; max passes on absent tags', () => {
		expect(condMet(tagged, { dim: 'mood.serenity', min: 0.55 })).toBe(true);
		expect(condMet(bare, { dim: 'mood.serenity', min: 0.55 })).toBe(false);
		expect(condMet(bare, { dim: 'mood.drama', max: 0.45 })).toBe(true);
		expect(condMet(tagged, { dim: 'mood.serenity', max: 0.45 })).toBe(false);
	});

	it('respects the confidence floor', () => {
		const faint = testWork('f', {});
		faint.tags['mood.serenity'] = { v: 0.9, c: 0.2, src: 'clip' };
		expect(condMet(faint, { dim: 'mood.serenity', min: 0.55 })).toBe(false);
		// A low-confidence tag cannot VIOLATE a max either.
		expect(condMet(faint, { dim: 'mood.serenity', max: 0.45 })).toBe(true);
	});
});

describe('selectOpeningPair', () => {
	const { works, curated } = syntheticSetup();

	it('fills every slot with works matching its own filters', () => {
		for (let i = 0; i < OPENING_SLOTS.length; i++) {
			const h = historyFromEvents([]);
			const pair = selectOpeningPair(i, works, curated, h, 42);
			expect(pair, OPENING_SLOTS[i]?.name).not.toBeNull();
			if (!pair) continue;
			const slot = OPENING_SLOTS[i]!;
			const byId = new Map(curated.works.map((e) => [e.id, e]));
			const fits = (workId: string, f: SideFilter) => {
				const entry = byId.get(workId);
				return (
					entry != null &&
					f.stages.includes(entry.stage) &&
					(!f.roles || f.roles.includes(entry.role))
				);
			};
			// The pair's works satisfy the slot's side filters in one order.
			const direct = fits(pair.a.id, slot.a) && fits(pair.b.id, slot.b);
			const flipped = fits(pair.a.id, slot.b) && fits(pair.b.id, slot.a);
			expect(direct || flipped).toBe(true);
		}
	});

	it('is deterministic for a given seed', () => {
		const h = () => historyFromEvents([]);
		const p1 = selectOpeningPair(0, works, curated, h(), 7);
		const p2 = selectOpeningPair(0, works, curated, h(), 7);
		expect(p1?.a.id).toBe(p2?.a.id);
		expect(p1?.b.id).toBe(p2?.b.id);
	});

	it('returns null when a slot cannot be filled', () => {
		// No curated collection at all.
		expect(selectOpeningPair(2, works, null, historyFromEvents([]), 1)).toBeNull();
		// Curated works exist but none matches the tension side.
		const calmOnly: CuratedOnboarding = {
			version: 1,
			works: [
				{ id: 'calm-old', stage: 1, role: 'anchor' },
				{ id: 'calm-new', stage: 1, role: 'anchor' }
			]
		};
		expect(selectOpeningPair(2, works, calmOnly, historyFromEvents([]), 1)).toBeNull();
	});

	it('respects cooldowns: a just-shown work never reappears', () => {
		const h = historyFromEvents([]);
		const first = selectOpeningPair(0, works, curated, h, 3);
		expect(first).not.toBeNull();
		if (!first) return;
		recordShown(h, first.a, first.b);
		const second = selectOpeningPair(1, works, curated, h, 3);
		if (second) {
			expect([second.a.id, second.b.id]).not.toContain(first.a.id);
			expect([second.a.id, second.b.id]).not.toContain(first.b.id);
		}
	});

	it('slot 6 challenges from outside the stage-1 canon', () => {
		const pair = selectOpeningPair(5, works, curated, historyFromEvents([]), 11);
		expect(pair).not.toBeNull();
		expect([pair?.a.id, pair?.b.id]).toContain('challenge');
	});
});

describe('sideCandidates', () => {
	const { works, curated } = syntheticSetup();

	it('filters by stage, role and tag conditions together', () => {
		const calm = sideCandidates(works, curated, OPENING_SLOTS[2]!.a);
		// atmos qualifies too: an untroubled landscape is a calm-side work.
		expect(calm.map((w) => w.id).sort()).toEqual(['atmos', 'calm-new', 'calm-old']);
		const challenge = sideCandidates(works, curated, OPENING_SLOTS[5]!.b);
		expect(challenge.map((w) => w.id)).toEqual(['challenge']);
	});
});
