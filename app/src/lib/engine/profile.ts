/**
 * Taste profile: the human-readable projection of the model.
 * Everything here derives from posterior means/variances and real counts —
 * evidence tiers instead of invented percentages, provisional flags for
 * imported hypotheses, explicit conflicts.
 */
import type { Work } from '../catalog/types';
import type { AppEvent, PriorSpec } from './events';
import { evidenceTier, isConflicted, type EvidenceTier, type TasteModel } from './model';

export interface OntologyDim {
	id: string;
	group: string;
	kind: 'scale' | 'binary' | 'intensity';
	label: string;
	poles?: [string, string];
}

export interface ProfileEntry {
	dim: string;
	label: string; // human phrasing incl. direction, e.g. "Restrained palettes"
	group: string;
	mu: number;
	z: number;
	tier: EvidenceTier;
	provisional: boolean;
	n: number;
}

export interface ArtistAffinity {
	name: string;
	wins: number;
	losses: number;
	saves: number;
	score: number; // shrunk win-rate in [0,1]
	seeded: boolean; // from imported prior
}

export interface TasteProfile {
	affinities: ProfileEntry[];
	aversions: ProfileEntry[];
	uncertain: ProfileEntry[];
	conflicts: ProfileEntry[];
	artists: ArtistAffinity[];
	interpretation: string[];
	totalChoices: number;
	temperature: number;
}

/** Direction-aware human label for a dim given the sign of its weight. */
export function directionLabel(dim: OntologyDim, mu: number): string {
	if (dim.kind === 'scale' && dim.poles) {
		return mu >= 0 ? capitalize(dim.poles[1]) : capitalize(dim.poles[0]);
	}
	return dim.label;
}

/**
 * What happened to a recorded session pattern since it was frozen.
 * 'holds' is a deliberate fifth state — "still reads the same" is an honest
 * answer the strengthened/weakened/changed/unresolved four cannot give.
 */
export type PatternStatus = 'strengthened' | 'weakened' | 'changed' | 'holds' | 'unresolved';

/** Compare a session_end pattern snapshot against the CURRENT model. */
export function patternStatusNow(
	p: { dim: string; s: 1 | -1; z: number },
	model: TasteModel
): PatternStatus {
	const d = model.dims.get(p.dim);
	if (!d || evidenceTier(d) === 'insufficient') return 'unresolved';
	if (Math.sign(d.mu) !== p.s) return 'changed';
	const zNow = Math.abs(d.mu) / Math.sqrt(d.variance);
	if (zNow >= p.z + 0.25) return 'strengthened';
	if (zNow <= p.z - 0.25) return 'weakened';
	return 'holds';
}

function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

function entryFor(
	model: TasteModel,
	dimId: string,
	ontology: Map<string, OntologyDim>
): ProfileEntry | null {
	const d = model.dims.get(dimId);
	const meta = ontology.get(dimId);
	if (!d || !meta) return null;
	const z = Math.abs(d.mu) / Math.sqrt(d.variance);
	return {
		dim: dimId,
		label: directionLabel(meta, d.mu),
		group: meta.group,
		mu: d.mu,
		z,
		tier: evidenceTier(d),
		provisional: d.provisional,
		n: d.n
	};
}

export function buildProfile(
	model: TasteModel,
	events: AppEvent[],
	workById: (id: string) => Work | undefined,
	ontologyDims: OntologyDim[]
): TasteProfile {
	const ontology = new Map(ontologyDims.map((d) => [d.id, d]));
	const entries: ProfileEntry[] = [];
	for (const dimId of model.dims.keys()) {
		if (dimId.startsWith('era.')) continue; // context, not a taste statement
		const e = entryFor(model, dimId, ontology);
		if (e) entries.push(e);
	}
	entries.sort((a, b) => b.z - a.z);

	const scored = entries.filter((e) => e.tier !== 'insufficient');
	const affinities = scored.filter((e) => e.mu > 0);
	const aversions = scored.filter((e) => e.mu < 0);
	const uncertain = entries.filter((e) => e.tier === 'insufficient' && e.n >= 4).slice(0, 8);
	const conflicts = entries.filter((e) => {
		const d = model.dims.get(e.dim);
		return d ? isConflicted(d) : false;
	});

	const artists = artistAffinities(events, workById, priorSpec(events));
	const totalChoices = events.filter((e) => e.t === 'pair_choice').length;

	return {
		affinities,
		aversions,
		uncertain,
		conflicts,
		artists,
		interpretation: interpret(model, affinities, aversions, conflicts, totalChoices),
		totalChoices,
		temperature: model.temperature
	};
}

export function priorSpec(events: AppEvent[]): PriorSpec | null {
	for (let i = events.length - 1; i >= 0; i--) {
		const e = events[i] as AppEvent;
		if (e.t === 'prior_import') return e.spec;
	}
	return null;
}

function artistAffinities(
	events: AppEvent[],
	workById: (id: string) => Work | undefined,
	prior: PriorSpec | null
): ArtistAffinity[] {
	const stats = new Map<string, { wins: number; losses: number; saves: number }>();
	const bump = (name: string, key: 'wins' | 'losses' | 'saves'): void => {
		if (!name || name === 'Unknown artist') return;
		const s = stats.get(name) ?? { wins: 0, losses: 0, saves: 0 };
		s[key]++;
		stats.set(name, s);
	};
	for (const e of events) {
		if (e.t === 'pair_choice' && (e.pick === 'a' || e.pick === 'b')) {
			const winner = workById(e.pick === 'a' ? e.a : e.b);
			const loser = workById(e.pick === 'a' ? e.b : e.a);
			if (winner) bump(winner.artist.name, 'wins');
			if (loser) bump(loser.artist.name, 'losses');
		} else if (e.t === 'save') {
			const w = workById(e.work);
			if (w) bump(w.artist.name, 'saves');
		}
	}
	const K = 4; // shrinkage pseudo-counts toward 0.5
	const out: ArtistAffinity[] = [];
	for (const [name, s] of stats) {
		const n = s.wins + s.losses;
		const score = (s.wins + 0.6 * s.saves + K * 0.5) / (n + 0.6 * s.saves + K);
		out.push({ name, ...s, score, seeded: false });
	}
	// Seeded artists from the imported prior that have no observations yet.
	if (prior) {
		for (const [fragment, affinity] of Object.entries(prior.artists)) {
			if (![...stats.keys()].some((n) => n.toLowerCase().includes(fragment.toLowerCase()))) {
				out.push({
					name: fragment,
					wins: 0,
					losses: 0,
					saves: 0,
					score: 0.5 + 0.25 * affinity,
					seeded: true
				});
			}
		}
	}
	return out.sort((a, b) => b.score - a.score);
}

const TIER_PHRASE: Record<EvidenceTier, string> = {
	strong: 'strong evidence',
	moderate: 'moderate evidence',
	weak: 'early evidence',
	insufficient: 'not enough evidence'
};

/** Honest natural-language reading of the current posterior. */
export function interpret(
	model: TasteModel,
	affinities: ProfileEntry[],
	aversions: ProfileEntry[],
	conflicts: ProfileEntry[],
	totalChoices: number
): string[] {
	const out: string[] = [];
	if (totalChoices < 8) {
		out.push(
			'Your profile is just beginning — keep choosing and the picture will sharpen with every session.'
		);
		return out;
	}
	const top = affinities[0];
	if (top) {
		const qualifier = top.provisional ? ' (imported hypothesis, being tested)' : '';
		out.push(
			`${top.label} draws you in most consistently so far — ${TIER_PHRASE[top.tier]}${qualifier}.`
		);
	}
	const subjectTop = affinities.find((e) => e.group === 'subject');
	const formalTop = affinities.find((e) => e.group === 'form' || e.group === 'color');
	if (subjectTop && formalTop) {
		if (formalTop.z > subjectTop.z * 1.3) {
			out.push(
				`How a painting is made (${formalTop.label.toLowerCase()}) currently matters more than what it depicts.`
			);
		} else if (subjectTop.z > formalTop.z * 1.3) {
			out.push(
				`What a painting depicts (${subjectTop.label.toLowerCase()}) currently outweighs how it is painted.`
			);
		}
	}
	const avTop = aversions[0];
	if (avTop) {
		out.push(
			`You most consistently pass on ${avTop.label.toLowerCase()} — ${TIER_PHRASE[avTop.tier]}.`
		);
	}
	for (const c of conflicts.slice(0, 2)) {
		out.push(
			`Your responses to ${c.label.toLowerCase()} pull in both directions — the attraction may depend on context the model hasn't isolated yet.`
		);
	}
	const provisionalLeft = affinities.filter((e) => e.provisional).length;
	if (provisionalLeft > 0) {
		out.push(
			`${provisionalLeft} imported ${provisionalLeft === 1 ? 'hypothesis is' : 'hypotheses are'} still provisional — the sessions ahead will confirm or refute ${provisionalLeft === 1 ? 'it' : 'them'}.`
		);
	}
	if (model.temperature > 1.5) {
		out.push(
			'Recent answers have been less consistent than usual, so conclusions are held more loosely for now.'
		);
	}
	return out;
}
