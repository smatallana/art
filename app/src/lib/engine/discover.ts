/**
 * Discovery: explainable recommendations over the taste model.
 * Every list here can say WHY — contributions come straight from posterior
 * weights × work features, related works from actual liked history.
 */
import type { Work } from '../catalog/types';
import type { AppEvent } from './events';
import { features, utility, type TasteModel } from './model';
import { mulberry32, shuffle } from './random';
import { eraBucket } from './strata';
import type { OntologyDim } from './profile';
import { directionLabel } from './profile';

export function seenWorkIds(events: AppEvent[]): Set<string> {
	const seen = new Set<string>();
	for (const e of events) {
		if (e.t === 'pair_choice') {
			seen.add(e.a);
			seen.add(e.b);
		} else if ('work' in e && typeof e.work === 'string') {
			seen.add(e.work);
		}
	}
	return seen;
}

/** Works the user actively liked: chose in a pair, saved, or remembered. */
export function likedWorkIds(events: AppEvent[]): Set<string> {
	const liked = new Set<string>();
	for (const e of events) {
		if (e.t === 'pair_choice' && (e.pick === 'a' || e.pick === 'b')) {
			liked.add(e.pick === 'a' ? e.a : e.b);
		} else if (e.t === 'save' || e.t === 'remember') {
			liked.add(e.work);
		} else if (e.t === 'unsave') {
			liked.delete(e.work);
		}
	}
	return liked;
}

export interface Contribution {
	dim: string;
	label: string;
	value: number; // mu_d * phi_d — signed contribution to predicted appeal
}

export function contributions(
	model: TasteModel,
	work: Work,
	ontology: Map<string, OntologyDim>
): Contribution[] {
	const out: Contribution[] = [];
	for (const [dimId, x] of features(work)) {
		if (dimId.startsWith('era.')) continue;
		const d = model.dims.get(dimId);
		const meta = ontology.get(dimId);
		if (!d || !meta || d.n < 2) continue;
		const value = d.mu * x;
		if (Math.abs(value) < 0.01) continue;
		out.push({ dim: dimId, label: directionLabel(meta, Math.sign(x) * d.mu), value });
	}
	return out.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}

export interface Recommendation {
	work: Work;
	kind: 'close' | 'challenge' | 'surprise';
	score: number;
	why: Contribution[]; // top signed contributions
	related: Work[]; // liked works sharing the strongest dims
}

function eligiblePool(works: Work[], events: AppEvent[]): Work[] {
	const seen = seenWorkIds(events);
	return works.filter((w) => !seen.has(w.id) && w.quality.score >= 0.45);
}

function diversify(ranked: Work[], n: number): Work[] {
	const out: Work[] = [];
	const perArtist = new Map<string, number>();
	for (const w of ranked) {
		const count = perArtist.get(w.artist.name) ?? 0;
		if (count >= 2) continue;
		perArtist.set(w.artist.name, count + 1);
		out.push(w);
		if (out.length >= n) break;
	}
	return out;
}

function relatedLiked(
	work: Work,
	model: TasteModel,
	ontology: Map<string, OntologyDim>,
	events: AppEvent[],
	workById: (id: string) => Work | undefined
): Work[] {
	const top = new Set(
		contributions(model, work, ontology)
			.filter((c) => c.value > 0)
			.slice(0, 4)
			.map((c) => c.dim)
	);
	if (top.size === 0) return [];
	const liked = [...likedWorkIds(events)]
		.map(workById)
		.filter((w): w is Work => w != null && w.id !== work.id);
	const scored = liked
		.map((w) => {
			let shared = 0;
			for (const [dimId, x] of features(w)) if (top.has(dimId) && x > 0) shared++;
			return { w, shared };
		})
		.filter((s) => s.shared >= 1)
		.sort((a, b) => b.shared - a.shared);
	return scored.slice(0, 3).map((s) => s.w);
}

export function recommendClose(
	model: TasteModel,
	works: Work[],
	events: AppEvent[],
	ontology: Map<string, OntologyDim>,
	workById: (id: string) => Work | undefined,
	n = 12
): Recommendation[] {
	const pool = eligiblePool(works, events);
	const ranked = pool
		.map((w) => {
			const u = utility(model, features(w));
			// conservative: prefer confidently-appealing over wildly-uncertain
			return { w, score: u.mean - 0.25 * Math.sqrt(u.variance) };
		})
		.sort((a, b) => b.score - a.score)
		.map((s) => s.w);
	return diversify(ranked, n).map((work) => ({
		work,
		kind: 'close' as const,
		score: utility(model, features(work)).mean,
		why: contributions(model, work, ontology)
			.filter((c) => c.value > 0)
			.slice(0, 3),
		related: relatedLiked(work, model, ontology, events, workById)
	}));
}

export function recommendChallenge(
	model: TasteModel,
	works: Work[],
	events: AppEvent[],
	ontology: Map<string, OntologyDim>,
	n = 8
): Recommendation[] {
	const pool = eligiblePool(works, events);
	const ranked = pool
		.map((w) => {
			const u = utility(model, features(w));
			return { w, score: Math.sqrt(u.variance) - u.mean };
		})
		.sort((a, b) => b.score - a.score)
		.map((s) => s.w);
	return diversify(ranked, n).map((work) => ({
		work,
		kind: 'challenge' as const,
		score: utility(model, features(work)).mean,
		// for challenges the honest "why" is the negative/uncertain side
		why: contributions(model, work, ontology)
			.filter((c) => c.value < 0)
			.slice(0, 3),
		related: []
	}));
}

export function surpriseMe(
	model: TasteModel,
	works: Work[],
	events: AppEvent[],
	seed: number
): Work | null {
	const pool = eligiblePool(works, events).filter((w) => w.quality.score >= 0.55);
	if (pool.length === 0) return null;
	const rng = mulberry32(seed);
	// stratified over eras so surprises roam the whole timeline
	const byEra = new Map<string, Work[]>();
	for (const w of pool) {
		const e = eraBucket(w);
		byEra.set(e, [...(byEra.get(e) ?? []), w]);
	}
	const eras = [...byEra.keys()];
	const era = eras[Math.floor(rng() * eras.length)] as string;
	const list = byEra.get(era) as Work[];
	return list[Math.floor(rng() * list.length)] ?? null;
}

export interface ArtistSuggestion {
	name: string;
	sampleWorks: Work[];
	meanUtility: number;
}

/** Artists never yet encountered, ranked by predicted appeal of their works. */
export function suggestArtists(
	model: TasteModel,
	works: Work[],
	events: AppEvent[],
	n = 8
): ArtistSuggestion[] {
	const seen = seenWorkIds(events);
	const encountered = new Set<string>();
	for (const id of seen) {
		const w = works.find((x) => x.id === id);
		if (w) encountered.add(w.artist.name);
	}
	const byArtist = new Map<string, Work[]>();
	for (const w of works) {
		if (w.artist.name === 'Unknown artist' || encountered.has(w.artist.name)) continue;
		byArtist.set(w.artist.name, [...(byArtist.get(w.artist.name) ?? []), w]);
	}
	const out: ArtistSuggestion[] = [];
	for (const [name, list] of byArtist) {
		if (list.length < 2) continue; // need a body of work to say anything
		const mean = list.reduce((acc, w) => acc + utility(model, features(w)).mean, 0) / list.length;
		out.push({ name, sampleWorks: list.slice(0, 3), meanUtility: mean });
	}
	return out.sort((a, b) => b.meanUtility - a.meanUtility).slice(0, n);
}

export interface ExploreFilter {
	kind: 'era' | 'movement' | 'subject' | 'mood' | 'museum';
	id: string;
	label: string;
	count: number;
}

const SUBJECT_FILTERS: [string, string][] = [
	['subject.portrait', 'Portraits'],
	['subject.landscape', 'Landscapes'],
	['subject.interior', 'Interiors'],
	['subject.stilllife', 'Still lifes'],
	['subject.marine', 'The sea'],
	['subject.religion', 'Sacred'],
	['subject.myth', 'Myth'],
	['subject.genre', 'Everyday life'],
	['light.nocturne', 'Night']
];
const ERA_LABELS: Record<string, string> = {
	pre1500: 'Before 1500',
	e1500: '1500–1700',
	e1700: '1700–1850',
	e1850: '1850–1900',
	e1900: 'After 1900'
};

export function exploreFilters(works: Work[]): ExploreFilter[] {
	const out: ExploreFilter[] = [];
	const eras = new Map<string, number>();
	const movements = new Map<string, number>();
	const museums = new Map<string, number>();
	const subjects = new Map<string, number>();
	for (const w of works) {
		const e = eraBucket(w);
		if (e !== 'unknown') eras.set(e, (eras.get(e) ?? 0) + 1);
		if (w.movement) movements.set(w.movement, (movements.get(w.movement) ?? 0) + 1);
		museums.set(w.museum.name, (museums.get(w.museum.name) ?? 0) + 1);
		for (const [dim] of SUBJECT_FILTERS) {
			const t = w.tags[dim];
			if (t && t.v >= 0.5) subjects.set(dim, (subjects.get(dim) ?? 0) + 1);
		}
	}
	for (const [id, count] of eras) {
		out.push({ kind: 'era', id, label: ERA_LABELS[id] ?? id, count });
	}
	for (const [dim, label] of SUBJECT_FILTERS) {
		const count = subjects.get(dim) ?? 0;
		if (count >= 12) out.push({ kind: 'subject', id: dim, label, count });
	}
	for (const [id, count] of [...movements].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
		if (count >= 8) out.push({ kind: 'movement', id, label: id, count });
	}
	for (const [id, count] of museums) {
		out.push({ kind: 'museum', id, label: id, count });
	}
	return out;
}

export function applyFilter(works: Work[], filter: ExploreFilter): Work[] {
	switch (filter.kind) {
		case 'era':
			return works.filter((w) => eraBucket(w) === filter.id);
		case 'movement':
			return works.filter((w) => w.movement === filter.id);
		case 'museum':
			return works.filter((w) => w.museum.name === filter.id);
		case 'subject':
		case 'mood':
			return works.filter((w) => (w.tags[filter.id]?.v ?? 0) >= 0.5);
	}
}

export function searchWorks(works: Work[], query: string, limit = 40): Work[] {
	const q = query.trim().toLowerCase();
	if (q.length < 2) return [];
	const scored: { w: Work; s: number }[] = [];
	for (const w of works) {
		let s = 0;
		if (w.title.toLowerCase().includes(q)) s += 3;
		if (w.artist.name.toLowerCase().includes(q)) s += 4;
		if (w.museum.name.toLowerCase().includes(q)) s += 1;
		if (w.movement?.toLowerCase().includes(q)) s += 2;
		if (s > 0) scored.push({ w, s });
	}
	return scored
		.sort((a, b) => b.s - a.s || b.w.quality.score - a.w.quality.score)
		.slice(0, limit)
		.map((x) => x.w);
}

/** Deterministic daily shuffle for explore grids (no personalization leak). */
export function shuffledForDisplay<T>(items: T[], seed: number): T[] {
	return shuffle(mulberry32(seed), items);
}
