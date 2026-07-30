/**
 * Persona harness over the REAL committed catalog (tramo 8 — method lesson).
 * The engine had only ever been validated on dense synthetic pools; real
 * first-user testing (five sessions, five identical endings) showed that a
 * person playing over the actual sparse catalog is a different instrument.
 * Three tasteful personas and one noisy contrarian play full sessions with
 * the real engine and the real works; the harness asserts that sessions end
 * with something claimable and that endings vary.
 *
 * It also MEASURES the non-era pattern share — the honest baseline that the
 * CLIP tagging stage (tag-clip) must move; the measurement is logged on
 * every run so the number stays visible in CI output.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Work } from '../catalog/types';
import type { CuratedOnboarding } from './curation';
import type { AppEvent } from './events';
import { sessionSummary, type SessionInsight } from './insight';
import { features, modelFromEvents } from './model';
import type { OntologyDim } from './profile';
import { advance, createSession, markAnswered } from './session';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const catalogDir = path.join(root, 'app', 'static', 'catalog');
const index = JSON.parse(readFileSync(path.join(catalogDir, 'index.json'), 'utf8')) as {
	shards: { file: string }[];
};
const works: Work[] = index.shards.flatMap(
	(s) => JSON.parse(readFileSync(path.join(catalogDir, s.file), 'utf8')) as Work[]
);
const byId = new Map(works.map((w) => [w.id, w]));
const lookup = (id: string) => byId.get(id);

const curated = JSON.parse(
	readFileSync(path.join(root, 'data', 'curated', 'onboarding.json'), 'utf8')
) as CuratedOnboarding;

// Same mapping ontology.ts applies to the bundled file — read via fs so the
// harness does not depend on the $data bundler alias.
const ontology = JSON.parse(readFileSync(path.join(root, 'data', 'ontology.json'), 'utf8')) as {
	dims: (OntologyDim & { poles?: string[] })[];
};
const DIMS: OntologyDim[] = ontology.dims.map((d) => ({
	id: d.id,
	group: d.group,
	kind: d.kind,
	label: d.label,
	poles: d.poles ? [d.poles[0] as string, d.poles[1] as string] : undefined
}));

interface Persona {
	name: string;
	/** Feature-space taste: utility(work) = Σ weight × feature value. */
	weights: Record<string, number>;
	contrarian?: boolean;
}

const PERSONAS: Persona[] = [
	{ name: 'vivid-color', weights: { 'color.saturation': 2, 'color.temperature': 0.6 } },
	{
		name: 'classic-portrait',
		weights: { 'subject.portrait': 2, 'subject.figure': 1, 'era.e1500': 1, 'era.e1700': 0.5 }
	},
	{
		name: 'modern-abstract',
		weights: { 'form.abstraction': 2, 'era.e1900': 1.5, 'era.e1850': 0.5 }
	},
	{ name: 'noisy-contrarian', weights: {}, contrarian: true }
];

/** Deterministic awkward-user script: sides, refusals, shrugs. */
const CONTRARIAN_PICKS = ['b', 'neither', 'a', 'unsure', 'neither', 'b', 'unsure', 'a'] as const;

function utility(w: Work, p: Persona): number {
	let u = 0;
	for (const [id, v] of features(w)) u += (p.weights[id] ?? 0) * v;
	return u;
}

function personaPick(
	p: Persona,
	a: Work,
	b: Work,
	answerIdx: number
): 'a' | 'b' | 'both' | 'neither' | 'unsure' {
	if (p.contrarian) return CONTRARIAN_PICKS[answerIdx % CONTRARIAN_PICKS.length] as 'a';
	// People pick even on weak signal; exact ties fall to slot a, which the
	// UI's display-side coin flip would decorrelate in production.
	return utility(a, p) >= utility(b, p) ? 'a' : 'b';
}

function choiceEvent(a: string, b: string, pick: string): AppEvent {
	return {
		id: crypto.randomUUID(),
		at: new Date().toISOString(),
		device: 'harness',
		hour: 12,
		t: 'pair_choice',
		a,
		b,
		pick,
		ms: null
	} as AppEvent;
}

/** Play one full session with the real engine; returns its summary. */
function playSession(p: Persona, log: AppEvent[]): SessionInsight {
	const ctx = () => ({
		works,
		events: log,
		model: modelFromEvents(log, { workById: lookup }),
		workById: lookup,
		seed: log.length + 1,
		curated
	});
	const engine = createSession(ctx());
	const sessionEvents: AppEvent[] = [];
	let answerIdx = 0;
	while (engine.state.phase !== 'done' && engine.state.current) {
		const wa = byId.get(engine.state.current.aId);
		const wb = byId.get(engine.state.current.bId);
		if (!wa || !wb) throw new Error('engine served a work missing from the catalog');
		const ev = choiceEvent(wa.id, wb.id, personaPick(p, wa, wb, answerIdx++));
		log.push(ev);
		sessionEvents.push(ev);
		markAnswered(engine);
		advance(engine, ctx());
	}
	return sessionSummary(sessionEvents, lookup, DIMS);
}

const SESSIONS_PER_PERSONA = 7; // 4 calibration (40-answer target) + 3 daily

/** One ending as the user would distinguish it: pattern labels, else facts. */
function endingSignature(s: SessionInsight): string {
	if (s.patterns.length > 0) return `pattern:${s.patterns.map((x) => x.label).join('+')}`;
	return `facts:${s.answered}|${s.facts.erasSeen}|${s.facts.topEra?.label ?? '-'}|${s.facts.savedCount}`;
}

describe('persona harness — real engine over the real catalog', () => {
	const results = new Map<string, SessionInsight[]>();
	for (const p of PERSONAS) {
		const log: AppEvent[] = [];
		results.set(
			p.name,
			Array.from({ length: SESSIONS_PER_PERSONA }, () => playSession(p, log))
		);
	}

	const all = [...results.values()].flat();

	it('reports the measurement the tag-clip stage must move', () => {
		const withPattern = all.filter((s) => s.patterns.length > 0);
		const withNonEra = all.filter((s) => s.patterns.some((p) => !p.dimId.startsWith('era.')));
		console.log(
			`[persona-harness] sessions=${all.length} ` +
				`withPattern=${withPattern.length} (${Math.round((withPattern.length / all.length) * 100)}%) ` +
				`withNonEraPattern=${withNonEra.length} (${Math.round((withNonEra.length / all.length) * 100)}%)`
		);
		for (const [name, sums] of results) {
			console.log(`[persona-harness] ${name}: ${sums.map(endingSignature).join(' · ')}`);
		}
		expect(all.length).toBe(PERSONAS.length * SESSIONS_PER_PERSONA);
	});

	it('tasteful personas end most sessions with a claimable pattern', () => {
		for (const p of PERSONAS.filter((x) => !x.contrarian)) {
			const sums = results.get(p.name) as SessionInsight[];
			const n = sums.filter((s) => s.patterns.length > 0).length;
			expect(n / sums.length, p.name).toBeGreaterThanOrEqual(0.5);
		}
	});

	it('no persona sees the same ending every time (the five-identical-endings bug)', () => {
		for (const [name, sums] of results) {
			const signatures = new Set(sums.map(endingSignature));
			expect(signatures.size, name).toBeGreaterThanOrEqual(2);
		}
	});

	it('every session ends sayable: a pattern or concrete facts', () => {
		for (const s of all) {
			const sayable = s.patterns.length > 0 || (s.answered > 0 && s.facts.erasSeen > 0);
			expect(sayable).toBe(true);
		}
	});
});
