/**
 * The scripted opening: the first six lifetime pairs follow an editorial
 * sequence (fourth external review) instead of generic coverage — immediate
 * pull, human vs atmosphere, calm vs tension, finish vs brushwork, real vs
 * dreamlike, then one legible challenge outside the safest canon. Slots are
 * data-driven filters over the curated collection's stages/roles and the
 * (now dense, post tag-clip) ontology tags. Everything is advisory: an
 * unfillable slot falls back to the existing era/subject arc — the session
 * never starves because the script was ambitious.
 */
import type { Work } from '../catalog/types';
import type { CuratedOnboarding } from './curation';
import { mulberry32, shuffle } from './random';
import {
	aspectCompatible,
	eligibleWorks,
	pairKey,
	probeOf,
	type SelectedPair,
	type SelectionHistory
} from './selector';

export interface TagCond {
	dim: string;
	/** Minimum tag value — FAILS when the tag is absent. */
	min?: number;
	/** Maximum tag value — passes when the tag is absent. */
	max?: number;
	/** Confidence floor (default 0.35 — admits calibrated clip tags). */
	minC?: number;
}

export interface SideFilter {
	stages: (1 | 2 | 3)[];
	roles?: ('anchor' | 'discovery' | 'contrast')[];
	/** Every condition must hold. */
	all?: TagCond[];
	/** At least one condition must hold. */
	any?: TagCond[];
}

export interface OpeningSlot {
	name: string;
	a: SideFilter;
	b: SideFilter;
	/** Prefer combinations whose works sit in different era buckets. */
	preferCrossEra?: boolean;
}

/** The six-slot script. Pole orientations follow data/ontology.json. */
export const OPENING_SLOTS: OpeningSlot[] = [
	{
		// 1 — immediate visual and emotional pull: two undisputed anchors.
		name: 'pull',
		a: { stages: [1], roles: ['anchor'] },
		b: { stages: [1], roles: ['anchor'] },
		preferCrossEra: true
	},
	{
		// 2 — human narrative versus atmosphere.
		name: 'human-vs-atmosphere',
		a: {
			stages: [1],
			any: [
				{ dim: 'subject.figure', min: 0.55 },
				{ dim: 'subject.humanpresence', min: 0.6 }
			]
		},
		b: {
			stages: [1],
			all: [{ dim: 'subject.humanpresence', max: 0.4 }],
			any: [
				{ dim: 'subject.landscape', min: 0.55 },
				{ dim: 'subject.marine', min: 0.55 },
				{ dim: 'mood.serenity', min: 0.55 }
			]
		}
	},
	{
		// 3 — calm versus tension. "Calm" is serene subject matter with no
		// drama or tension claimed (strict serenity+no-drama measured only ONE
		// stage-1 candidate on the real catalog — mood.drama tags are common).
		name: 'calm-vs-tension',
		a: {
			stages: [1],
			all: [
				{ dim: 'mood.drama', max: 0.45 },
				{ dim: 'mood.tension', max: 0.45 }
			],
			any: [
				{ dim: 'mood.serenity', min: 0.55 },
				{ dim: 'subject.stilllife', min: 0.55 },
				{ dim: 'subject.landscape', min: 0.55 },
				{ dim: 'subject.interior', min: 0.55 }
			]
		},
		b: {
			stages: [1],
			any: [
				{ dim: 'mood.drama', min: 0.55 },
				{ dim: 'mood.tension', min: 0.55 }
			]
		}
	},
	{
		// 4 — polished finish versus visible brushwork. The polished side
		// needs an EXPLICIT low tag: an absent brushwork tag means the
		// tag-clip deadband (ambiguous), not smoothness.
		name: 'finish-vs-brushwork',
		a: { stages: [1], all: [{ dim: 'form.brushwork', min: 0, max: 0.4 }] },
		b: { stages: [1], all: [{ dim: 'form.brushwork', min: 0.6 }] }
	},
	{
		// 5 — realistic plausibility versus dreamlike ambiguity (explicit low
		// stylization for the same deadband reason as slot 4).
		name: 'real-vs-dreamlike',
		a: {
			stages: [1],
			all: [
				{ dim: 'form.stylization', min: 0, max: 0.4 },
				{ dim: 'mood.mystery', max: 0.5 }
			]
		},
		b: {
			stages: [1],
			any: [
				{ dim: 'form.stylization', min: 0.6 },
				{ dim: 'mood.mystery', min: 0.6 },
				{ dim: 'mood.strangeness', min: 0.55 }
			]
		}
	},
	{
		// 6 — a visually legible challenge outside the safest canon: the
		// curated contrast/discovery roles finally earn their keep.
		name: 'legible-challenge',
		a: { stages: [1], roles: ['anchor'] },
		b: { stages: [2, 3], roles: ['contrast', 'discovery'] }
	}
];

export function condMet(w: Work, c: TagCond): boolean {
	const tag = w.tags[c.dim];
	const minC = c.minC ?? 0.35;
	if (c.min != null) {
		if (!tag || tag.c < minC || tag.v < c.min) return false;
	}
	if (c.max != null) {
		if (tag && tag.c >= minC && tag.v > c.max) return false;
	}
	return true;
}

/** Curated works matching one side of a slot (unordered, unfiltered for
 *  cooldowns — the caller applies eligibility). */
export function sideCandidates(works: Work[], curated: CuratedOnboarding, f: SideFilter): Work[] {
	const byId = new Map(works.map((w) => [w.id, w]));
	const out: Work[] = [];
	for (const entry of curated.works) {
		if (!f.stages.includes(entry.stage)) continue;
		if (f.roles && !f.roles.includes(entry.role)) continue;
		const w = byId.get(entry.id);
		if (!w) continue;
		if (f.all && !f.all.every((c) => condMet(w, c))) continue;
		if (f.any && !f.any.some((c) => condMet(w, c))) continue;
		out.push(w);
	}
	return out;
}

const SCAN = 24; // combinations scanned per side before giving up

/** Committed editorial pair variants per slot (data/curated/opening.json). */
export interface OpeningEditorialData {
	slots: { name: string; pairs: { a: string; b: string; note?: string }[] }[];
}

/**
 * Build the pair for one opening slot, or null when the slot cannot be
 * filled under cooldown/novelty constraints (the caller falls back).
 * Editorial variants (hand-editable, committed) outrank the filter path:
 * an eligible editorial pair for the slot is drawn first; the filter
 * machinery remains the fallback so an over-pruned slot never starves.
 */
export function selectOpeningPair(
	slotIndex: number,
	works: Work[],
	curated: CuratedOnboarding | null,
	h: SelectionHistory,
	seed: number,
	editorial?: OpeningEditorialData | null
): SelectedPair | null {
	const slot = OPENING_SLOTS[slotIndex];
	if (!slot || !curated) return null;
	const rng = mulberry32(seed * 97 + slotIndex * 53);
	const byId = new Map(works.map((w) => [w.id, w]));
	const variants = editorial?.slots.find((s) => s.name === slot.name)?.pairs ?? [];
	if (variants.length > 0) {
		const eligibleSet = new Set(eligibleWorks(works, h).map((w) => w.id));
		const usable = shuffle(rng, variants).filter((p) => {
			if (!eligibleSet.has(p.a) || !eligibleSet.has(p.b)) return false;
			if (h.seenPairs.has(pairKey(p.a, p.b))) return false;
			const wa = byId.get(p.a);
			const wb = byId.get(p.b);
			return !!wa && !!wb && aspectCompatible(wa, wb);
		});
		const pick = usable[0];
		if (pick) {
			const wa = byId.get(pick.a) as Work;
			const wb = byId.get(pick.b) as Work;
			return { a: wa, b: wb, probe: probeOf(wa, wb) };
		}
	}
	const sideA = shuffle(rng, eligibleWorks(sideCandidates(works, curated, slot.a), h));
	const sideB = shuffle(rng, eligibleWorks(sideCandidates(works, curated, slot.b), h));
	let fallback: SelectedPair | null = null;
	for (const a of sideA.slice(0, SCAN)) {
		for (const b of sideB.slice(0, SCAN)) {
			if (a.id === b.id) continue;
			if (a.artist.name === b.artist.name && a.artist.name !== 'Unknown artist') continue;
			if (h.seenPairs.has(pairKey(a.id, b.id))) continue;
			if (!aspectCompatible(a, b)) continue;
			const pair = { a, b, probe: probeOf(a, b) };
			if (!slot.preferCrossEra || pair.probe === 'cross-era') return pair;
			fallback ??= pair;
		}
	}
	return fallback;
}
