/**
 * curate-opening: materialize the scripted opening's slot filters into an
 * EDITABLE editorial pair list (data/curated/opening.json). First edition is
 * generated; the owner edits it like onboarding.json. The filter logic here
 * MIRRORS app/src/lib/engine/opening.ts (no cross-workspace import — drift
 * is caught by the app-side validation test, which checks every committed
 * editorial pair against the real slot filters).
 */
import { readFile, writeFile } from 'node:fs/promises';
import type { Work } from './types.js';
import { loadCatalog } from './catalog.js';

interface TagCond {
	dim: string;
	min?: number;
	max?: number;
	minC?: number;
}
interface SideFilter {
	stages: (1 | 2 | 3)[];
	roles?: string[];
	all?: TagCond[];
	any?: TagCond[];
}
interface Slot {
	name: string;
	a: SideFilter;
	b: SideFilter;
	preferCrossEra?: boolean;
}

// Mirror of OPENING_SLOTS in app/src/lib/engine/opening.ts.
const SLOTS: Slot[] = [
	{
		name: 'pull',
		a: { stages: [1], roles: ['anchor'] },
		b: { stages: [1], roles: ['anchor'] },
		preferCrossEra: true
	},
	{
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
		name: 'finish-vs-brushwork',
		a: { stages: [1], all: [{ dim: 'form.brushwork', min: 0, max: 0.4 }] },
		b: { stages: [1], all: [{ dim: 'form.brushwork', min: 0.6 }] }
	},
	{
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
		name: 'legible-challenge',
		a: { stages: [1], roles: ['anchor'] },
		b: { stages: [2, 3], roles: ['contrast', 'discovery'] }
	}
];

function condMet(w: Work, c: TagCond): boolean {
	const tag = w.tags[c.dim];
	const minC = c.minC ?? 0.35;
	if (c.min != null && (!tag || tag.c < minC || tag.v < c.min)) return false;
	if (c.max != null && tag && tag.c >= minC && tag.v > c.max) return false;
	return true;
}

function eraBucket(w: Work): string {
	const y = w.date.start ?? w.date.end;
	if (y == null) return 'unknown';
	if (y < 1500) return 'pre1500';
	if (y < 1700) return 'e1500';
	if (y < 1850) return 'e1700';
	if (y < 1900) return 'e1850';
	return 'e1900';
}

interface CuratedEntry {
	id: string;
	stage: 1 | 2 | 3;
	role: string;
}

function sideCandidates(byId: Map<string, Work>, curated: CuratedEntry[], f: SideFilter): Work[] {
	const out: Work[] = [];
	for (const e of curated) {
		if (!f.stages.includes(e.stage)) continue;
		if (f.roles && !f.roles.includes(e.role)) continue;
		const w = byId.get(e.id);
		if (!w) continue;
		if (f.all && !f.all.every((c) => condMet(w, c))) continue;
		if (f.any && !f.any.some((c) => condMet(w, c))) continue;
		out.push(w);
	}
	return out;
}

const VARIANTS = 6;
const MAX_WORK_USES = 2; // per slot, across its variants
// Global caps across the WHOLE file (T11): the first edition reused the same
// top-quality anchors everywhere — 17 distinct works in 36 variants, the same
// canonical pair in four slots — which turned any repetition bug into a
// RECOGNIZABLE repeat. Pass 1 admits a work at most twice file-wide; pass 2
// relaxes to four only if a slot cannot reach its variant count. A canonical
// pair is never admitted twice anywhere.
const MAX_GLOBAL_USES = 2;
const MAX_GLOBAL_USES_RELAXED = 4;

const canonicalKey = (a: string, b: string): string => (a < b ? `${a}::${b}` : `${b}::${a}`);

export async function runCurateOpening(opts: {
	catalogDir: string;
	onboardingFile: string;
	outFile: string;
	force: boolean;
	log: (m: string) => void;
}): Promise<void> {
	const { catalogDir, onboardingFile, outFile, force, log } = opts;
	try {
		await readFile(outFile, 'utf8');
		if (!force) {
			log(`refusing to overwrite ${outFile} (owner edits live there) — pass --force`);
			return;
		}
	} catch {
		// no existing file — fine
	}
	const works = await loadCatalog(catalogDir);
	const byId = new Map(works.map((w) => [w.id, w]));
	const curated = (JSON.parse(await readFile(onboardingFile, 'utf8')) as { works: CuratedEntry[] })
		.works;

	const globalUses = new Map<string, number>();
	const globalPairKeys = new Set<string>();
	const slots = SLOTS.map((slot) => {
		const a = sideCandidates(byId, curated, slot.a).sort(
			(x, y) => y.quality.score - x.quality.score
		);
		const b = sideCandidates(byId, curated, slot.b).sort(
			(x, y) => y.quality.score - x.quality.score
		);
		const uses = new Map<string, number>();
		const pairs: { a: string; b: string; note: string }[] = [];
		const candidates: { wa: Work; wb: Work; score: number; cross: boolean }[] = [];
		for (const wa of a) {
			for (const wb of b) {
				if (wa.id === wb.id || wa.artist.name === wb.artist.name) continue;
				const ra = wa.images.aspect;
				const rb = wb.images.aspect;
				if (Math.max(ra, rb) / Math.min(ra, rb) >= 2.6) continue;
				candidates.push({
					wa,
					wb,
					score: wa.quality.score + wb.quality.score,
					cross: eraBucket(wa) !== eraBucket(wb)
				});
			}
		}
		candidates.sort((x, y) =>
			slot.preferCrossEra && x.cross !== y.cross
				? Number(y.cross) - Number(x.cross)
				: y.score - x.score
		);
		// Two passes: strict global cap first; relax only if the slot cannot
		// fill (over-used works get demoted, never hard-picked; a canonical
		// pair is globally unique in both passes).
		for (const globalCap of [MAX_GLOBAL_USES, MAX_GLOBAL_USES_RELAXED]) {
			for (const c of candidates) {
				if (pairs.length >= VARIANTS) break;
				const key = canonicalKey(c.wa.id, c.wb.id);
				if (globalPairKeys.has(key)) continue;
				if ((uses.get(c.wa.id) ?? 0) >= MAX_WORK_USES) continue;
				if ((uses.get(c.wb.id) ?? 0) >= MAX_WORK_USES) continue;
				if ((globalUses.get(c.wa.id) ?? 0) >= globalCap) continue;
				if ((globalUses.get(c.wb.id) ?? 0) >= globalCap) continue;
				uses.set(c.wa.id, (uses.get(c.wa.id) ?? 0) + 1);
				uses.set(c.wb.id, (uses.get(c.wb.id) ?? 0) + 1);
				globalUses.set(c.wa.id, (globalUses.get(c.wa.id) ?? 0) + 1);
				globalUses.set(c.wb.id, (globalUses.get(c.wb.id) ?? 0) + 1);
				globalPairKeys.add(key);
				pairs.push({
					a: c.wa.id,
					b: c.wb.id,
					note: `${c.wa.artist.name} — ${c.wa.title} × ${c.wb.artist.name} — ${c.wb.title}`
				});
			}
			if (pairs.length >= VARIANTS) break;
		}
		log(`${slot.name}: ${pairs.length} editorial pairs (from ${candidates.length} candidates)`);
		return { name: slot.name, pairs };
	});
	const maxUses = Math.max(0, ...globalUses.values());
	log(`distinct works across all slots: ${globalUses.size}, max per-work uses: ${maxUses}`);

	await writeFile(
		outFile,
		JSON.stringify(
			{
				version: 1,
				note: 'Editorial opening pairs — first edition generated by curate-opening; edit freely, validated in CI against the real slot filters.',
				slots
			},
			null,
			1
		)
	);
	log(`wrote ${outFile}`);
}
