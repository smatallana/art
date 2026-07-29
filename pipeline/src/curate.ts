/**
 * Draft generator for the curated onboarding collection (tramo 7).
 *
 * The committed data/curated/onboarding.json is an EDITORIAL artifact: this
 * command only drafts its first edition from the committed catalog (scores +
 * quotas below), after which the file is hand-maintained — it refuses to
 * overwrite without --force, and the app-side validation test pins its
 * invariants (ids exist, eligibility, stage sizes, spread) in CI.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Work } from './types.js';

export interface CuratedEntry {
	id: string;
	stage: 1 | 2 | 3;
	role: 'anchor' | 'discovery' | 'contrast';
	note?: string;
}

const SPECIALIST_MEDIUM =
	/\b(manuscript|folio|album|leaf|leaves|fan|textile|fragment|thangka|screen)\b|scroll/;

type EraBucket = 'pre1500' | 'e1500' | 'e1700' | 'e1850' | 'e1900';

function eraBucket(w: Work): EraBucket | null {
	const y = w.date.start ?? w.date.end;
	if (y == null) return null;
	if (y < 1500) return 'pre1500';
	if (y < 1700) return 'e1500';
	if (y < 1850) return 'e1700';
	if (y < 1900) return 'e1850';
	return 'e1900';
}

function tagOn(w: Work, dim: string, threshold = 0.5): boolean {
	const t = w.tags[dim];
	return !!t && t.v >= threshold;
}

function family(w: Work): 'people' | 'land' | 'interior' | 'still' | 'other' {
	if (tagOn(w, 'subject.portrait') || tagOn(w, 'subject.figure') || tagOn(w, 'subject.group'))
		return 'people';
	if (tagOn(w, 'subject.landscape') || tagOn(w, 'subject.marine') || tagOn(w, 'subject.cityscape'))
		return 'land';
	if (tagOn(w, 'subject.interior') || tagOn(w, 'subject.genre')) return 'interior';
	if (tagOn(w, 'subject.stilllife')) return 'still';
	return 'other';
}

interface Opts {
	catalogDir: string;
	canonFile: string;
	outFile: string;
	force: boolean;
	log: (msg: string) => void;
}

export async function runCurateOnboarding({
	catalogDir,
	canonFile,
	outFile,
	force,
	log
}: Opts): Promise<void> {
	try {
		await readFile(outFile, 'utf8');
		if (!force) {
			log('curate: onboarding.json already exists — refusing to overwrite without --force');
			log('curate: (the committed file is hand-maintained; the draft is only its origin)');
			return;
		}
	} catch {
		// no existing file — proceed
	}

	const index = JSON.parse(await readFile(path.join(catalogDir, 'index.json'), 'utf8')) as {
		shards: { file: string }[];
	};
	const works: Work[] = [];
	for (const s of index.shards) {
		works.push(...(JSON.parse(await readFile(path.join(catalogDir, s.file), 'utf8')) as Work[]));
	}
	const canon = JSON.parse(await readFile(canonFile, 'utf8')) as {
		artists: { name: string }[];
	};
	const canonNames = new Set(canon.artists.map((a) => a.name));

	// Strict eligibility for the FIRST sessions: legible on a phone, judged
	// on its own terms, from a known hand.
	const eligible = works.filter((w) => {
		if (w.images.width > 0 && w.images.width < 900) return false;
		if (w.images.aspect < 0.5 || w.images.aspect > 2.2) return false;
		if (w.quality.score < 0.6) return false;
		if (SPECIALIST_MEDIUM.test((w.medium ?? '').toLowerCase())) return false;
		if (w.artist.name === 'Unknown artist') return false;
		if (eraBucket(w) == null) return false;
		return true;
	});

	const score = (w: Work): number =>
		w.quality.score +
		(canonNames.has(w.artist.name) ? 0.25 : 0) +
		(w.story ? 0.05 : 0) +
		(w.movement ? 0.05 : 0);

	const ranked = [...eligible].sort((a, b) => score(b) - score(a));

	const STAGE_TARGET = 100;
	const perArtist = new Map<string, number>();
	let manualCount = 0; // wd-m-* ids are rename-fragile; cap their share
	const picked: CuratedEntry[] = [];
	const pickedIds = new Set<string>();

	const fill = (
		stage: 1 | 2 | 3,
		wantFamily: (f: ReturnType<typeof family>) => boolean,
		roleFor: (w: Work) => CuratedEntry['role']
	): void => {
		const perSource = new Map<string, number>();
		const perEra = new Map<string, number>();
		let count = 0;
		for (const w of ranked) {
			if (count >= STAGE_TARGET) break;
			if (pickedIds.has(w.id)) continue;
			if (!wantFamily(family(w))) continue;
			if ((perArtist.get(w.artist.name) ?? 0) >= 3) continue;
			// Per-stage source cap at 38% keeps the OVERALL share under the 40%
			// invariant the validation test pins, even after hand-pruning.
			if ((perSource.get(w.source) ?? 0) >= STAGE_TARGET * 0.38) continue;
			if (w.id.startsWith('wd-m-') && manualCount >= 8) continue;
			const era = eraBucket(w) as string;
			// Soft era spread: no bucket may take more than half a stage.
			if ((perEra.get(era) ?? 0) >= STAGE_TARGET * 0.5) continue;
			picked.push({
				id: w.id,
				stage,
				role: roleFor(w),
				note: `${w.artist.name} — ${w.title}${w.date.display ? ` (${w.date.display})` : ''}`
			});
			pickedIds.add(w.id);
			perArtist.set(w.artist.name, (perArtist.get(w.artist.name) ?? 0) + 1);
			perSource.set(w.source, (perSource.get(w.source) ?? 0) + 1);
			perEra.set(era, (perEra.get(era) ?? 0) + 1);
			if (w.id.startsWith('wd-m-')) manualCount++;
			count++;
		}
	};

	// Stage 1: the most legible contrasts — people and places, known hands.
	fill(
		1,
		(f) => f === 'people' || f === 'land',
		(w) => (canonNames.has(w.artist.name) ? 'anchor' : 'discovery')
	);
	// Stage 2: widen the subject space.
	fill(
		2,
		(f) => f === 'interior' || f === 'still' || f === 'people' || f === 'land',
		(w) => (canonNames.has(w.artist.name) ? 'anchor' : 'discovery')
	);
	// Stage 3: contrast material — the 'other' family (abstraction, symbolism,
	// non-Western modes) that tests the edges of a first read. Canon hands in
	// familiar families stay 'anchor': the recovery pivot needs them here too.
	fill(
		3,
		() => true,
		(w) =>
			family(w) === 'other' ? 'contrast' : canonNames.has(w.artist.name) ? 'anchor' : 'discovery'
	);

	const out = {
		version: 1,
		note:
			'First editorial edition, drafted programmatically from the committed catalog ' +
			'(tsx src/run.ts curate-onboarding) and hand-maintained afterwards. Edit freely: ' +
			'stages gate the first sessions (1 = first answers, 3 = late calibration), roles ' +
			'are editorial metadata, and the validation test pins ids/eligibility/spread in CI.',
		works: picked
	};
	await mkdir(path.dirname(outFile), { recursive: true });
	await writeFile(outFile, JSON.stringify(out, null, '\t') + '\n');
	const bySource = new Map<string, number>();
	for (const p of picked) {
		const src = p.id.split('-')[0] as string;
		bySource.set(src, (bySource.get(src) ?? 0) + 1);
	}
	log(
		`curate: ${picked.length} works (${[...bySource.entries()]
			.map(([s, n]) => `${s} ${n}`)
			.join(', ')}), ${new Set(picked.map((p) => p.note?.split(' — ')[0])).size} artists`
	);
}
