/**
 * Pipeline CLI.
 *
 *   tsx src/run.ts sample                       # tiny raw samples per source → work/samples/
 *   tsx src/run.ts build --limit=1500 --out=../app/static/catalog [--skip-probe]
 *
 * Stages: fetch → normalize → tag → dedupe → quality → probe images → publish.
 * Designed to run in GitHub Actions (museum domains are blocked in the dev
 * sandbox); everything is deterministic given the fetched inputs.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aic, aicTagFields } from './sources/aic.js';
import { cma, cmaTagFields } from './sources/cma.js';
import { tagFromMetadata } from './tagger.js';
import { coverageReport, type CanonFile, type ManualWorksFile } from './coverage.js';
import { dedupe, scoreQuality } from './quality.js';
import { publishCatalog } from './publish.js';
import { validateImages } from './validate.js';
import type { SourceAdapter, Work } from './types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const workDir = path.join(here, '..', 'work');

const ADAPTERS: Record<string, SourceAdapter> = { aic, cma };
const TAG_FIELDS: Record<
	string,
	(raw: unknown) => { subjects: string[]; styles: string[]; terms: string[] }
> = {
	aic: aicTagFields,
	cma: cmaTagFields
};

function arg(name: string, fallback: string): string {
	const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
	return hit ? (hit.split('=')[1] as string) : fallback;
}
const hasFlag = (name: string): boolean => process.argv.includes(`--${name}`);

const log = (msg: string): void => console.log(`[pipeline] ${msg}`);

async function loadOntologyVersion(): Promise<number> {
	const p = path.join(here, '..', '..', 'data', 'ontology.json');
	const ontology = JSON.parse(await readFile(p, 'utf8')) as { version: number };
	return ontology.version;
}

async function loadCuratedOverrides(): Promise<Record<string, Partial<Work>>> {
	try {
		const p = path.join(here, '..', '..', 'data', 'curated', 'overrides.json');
		return JSON.parse(await readFile(p, 'utf8'));
	} catch {
		return {};
	}
}

async function cmdSample(): Promise<void> {
	const outDir = path.join(workDir, 'samples');
	await mkdir(outDir, { recursive: true });
	for (const adapter of Object.values(ADAPTERS)) {
		const sample = await adapter.fetchSample(3);
		await writeFile(path.join(outDir, `${adapter.id}.json`), JSON.stringify(sample, null, 2));
		log(`sample: wrote ${adapter.id}.json (${sample.length} records)`);
		// End-to-end check against live data: normalize + tag each sample and
		// print a compact summary so CI logs verify the adapters truly work.
		for (const raw of sample) {
			const result = adapter.normalize(raw);
			if ('reject' in result) {
				console.log(`SAMPLE ${adapter.id} REJECT: ${result.reject}`);
				continue;
			}
			const w = result.work;
			const fields = TAG_FIELDS[adapter.id];
			const tags = fields
				? tagFromMetadata({
						title: w.title,
						movement: w.movement,
						culture: w.culture,
						medium: w.medium,
						...fields(raw)
					})
				: {};
			console.log(
				`SAMPLE ${adapter.id} OK: ` +
					JSON.stringify({
						id: w.id,
						title: w.title.slice(0, 40),
						artist: `${w.artist.name} (${w.artist.born}–${w.artist.died}, ${w.artist.nationality})`,
						date: w.date.display,
						aspect: w.images.aspect,
						px: `${w.images.width}x${w.images.height}`,
						display: w.images.display.slice(0, 90),
						story: w.story ? w.story.slice(0, 60) : null,
						tags: Object.keys(tags)
					})
			);
		}
	}
}

async function cmdBuild(): Promise<void> {
	const limit = parseInt(arg('limit', '1500'), 10);
	const sources = arg('sources', 'aic,cma').split(',');
	const outDir = path.resolve(arg('out', path.join(workDir, 'catalog')));
	const ontologyVersion = await loadOntologyVersion();
	const overrides = await loadCuratedOverrides();

	const rejects: Record<string, number> = {};
	const works: Work[] = [];

	// --merge: start from the already-published catalog so a run can add a
	// source without refetching the others. Existing records go first, so
	// dedupe prefers museum records over Wikidata duplicates of the same work.
	if (hasFlag('merge')) {
		const { loadCatalog } = await import('./catalog.js');
		try {
			const existing = await loadCatalog(outDir);
			const refetching = new Set(sources);
			const kept = existing.filter((w) => !refetching.has(w.source));
			works.push(...kept);
			log(`merge: preloaded ${kept.length} existing works (sources being refetched excluded)`);
		} catch {
			log('merge: no existing catalog found — building fresh');
		}
	}

	for (const id of sources) {
		if (id === 'rijks' || id === 'met') {
			const { fetchCollectionWorks, RIJKS_CONFIG, MET_CONFIG } =
				await import('./sources/collectionwd.js');
			// Never double-list a painting the canon (wd-Q…) or another
			// collection source already carries — same Wikidata item, one record.
			const excludeQids = new Set(
				works.filter((w) => /^Q\d+$/.test(w.sourceId)).map((w) => w.sourceId)
			);
			const cfg = { ...(id === 'rijks' ? RIJKS_CONFIG : MET_CONFIG), limit };
			try {
				works.push(...(await fetchCollectionWorks(cfg, excludeQids, log)));
			} catch (e) {
				log(`source ${id} FAILED: ${e}`);
				rejects[`${id}:fetch-failed`] = 1;
			}
			continue;
		}
		if (id === 'wd') {
			const { fetchCanonWorks } = await import('./sources/canonwd.js');
			const canonDir = path.join(here, '..', '..', 'data', 'canon');
			try {
				const canonWorks = await fetchCanonWorks(
					path.join(canonDir, 'canon.json'),
					path.join(canonDir, 'manual-works.json'),
					log
				);
				works.push(...canonWorks);
			} catch (e) {
				log(`source wd FAILED: ${e}`);
				rejects['wd:fetch-failed'] = 1;
			}
			continue;
		}
		const adapter = ADAPTERS[id];
		if (!adapter) throw new Error(`unknown source: ${id}`);
		log(`fetching up to ${limit} from ${id}…`);
		let raws: unknown[] = [];
		try {
			raws = await adapter.fetchRaw(limit, log);
		} catch (e) {
			// One source failing must not sink the whole build.
			log(`source ${id} FAILED: ${e}`);
			rejects[`${id}:fetch-failed`] = 1;
			continue;
		}
		for (const raw of raws) {
			const result = adapter.normalize(raw);
			if ('reject' in result) {
				rejects[`${id}:${result.reject}`] = (rejects[`${id}:${result.reject}`] ?? 0) + 1;
				continue;
			}
			const work = result.work;
			const fields = (
				TAG_FIELDS[id] as (r: unknown) => {
					subjects: string[];
					styles: string[];
					terms: string[];
				}
			)(raw);
			work.tags = tagFromMetadata({
				title: work.title,
				movement: work.movement,
				culture: work.culture,
				medium: work.medium,
				...fields
			});
			works.push(work);
		}
	}
	log(`normalized: ${works.length} works; rejects: ${JSON.stringify(rejects)}`);

	const { works: unique, removed, flagged } = dedupe(works);
	log(`dedupe: removed ${removed} identical ids, flagged ${flagged} possible duplicates`);

	let scored = unique.map(scoreQuality);

	// Curated overrides (micro-stories, tag corrections) merge last and win.
	let overridden = 0;
	scored = scored.map((w) => {
		const o = overrides[w.id];
		if (!o) return w;
		overridden++;
		return { ...w, ...o, tags: { ...w.tags, ...(o.tags ?? {}) } };
	});
	if (overridden) log(`curated overrides applied: ${overridden}`);

	let report: unknown = null;
	if (!hasFlag('skip-probe')) {
		log(`probing display images for ${scored.length} works…`);
		const v = await validateImages(scored, {}, log);
		scored = v.works;
		report = v.report;
		log(`probe: ${v.report.survivors}/${v.report.checked} alive`);
	}

	const index = await publishCatalog(scored, outDir, ontologyVersion);
	const coverage = coverageReport(scored, await loadCanon(), await loadManualWorks(), log);
	await writeCoverage(coverage);
	await mkdir(workDir, { recursive: true });
	await writeFile(
		path.join(workDir, 'report.json'),
		JSON.stringify(
			{
				index,
				rejects,
				dedupeRemoved: removed,
				dedupeFlagged: flagged,
				imageReport: report,
				coverage
			},
			null,
			2
		)
	);
	log(`published ${index.count} works → ${outDir}`);
}

/**
 * Coverage & concentration governance lives in coverage.ts (tramo 7): shares
 * PLUS the canon target-vs-actual diff, so absences are visible in-repo.
 */
async function loadCanon(): Promise<CanonFile | null> {
	try {
		const p = path.join(here, '..', '..', 'data', 'canon', 'canon.json');
		return JSON.parse(await readFile(p, 'utf8')) as CanonFile;
	} catch {
		return null;
	}
}

async function loadManualWorks(): Promise<ManualWorksFile | null> {
	try {
		const p = path.join(here, '..', '..', 'data', 'canon', 'manual-works.json');
		return JSON.parse(await readFile(p, 'utf8')) as ManualWorksFile;
	} catch {
		return null;
	}
}

/** The committed governance artifact — reviewable and diffable in PRs. */
async function writeCoverage(coverage: unknown): Promise<void> {
	const p = path.join(here, '..', '..', 'data', 'coverage.json');
	await writeFile(p, JSON.stringify(coverage, null, '\t') + '\n');
	log(`coverage: wrote ${p}`);
}

/** Offline governance run over the COMMITTED catalog — no network needed. */
async function cmdCoverage(): Promise<void> {
	const catalogDir = path.resolve(
		arg('out', path.join(here, '..', '..', 'app', 'static', 'catalog'))
	);
	const { loadCatalog } = await import('./catalog.js');
	const works = await loadCatalog(catalogDir);
	const index = JSON.parse(await readFile(path.join(catalogDir, 'index.json'), 'utf8')) as {
		generatedAt?: string;
	};
	const coverage = coverageReport(
		works,
		await loadCanon(),
		await loadManualWorks(),
		log,
		index.generatedAt ?? null
	);
	await writeCoverage(coverage);
}

async function cmdEmbed(): Promise<void> {
	const { runEmbedStage } = await import('./embed.js');
	const catalogDir = path.resolve(
		arg('out', path.join(here, '..', '..', 'app', 'static', 'catalog'))
	);
	const commonsMapFile = path.join(here, '..', '..', 'data', 'commons-map.json');
	await runEmbedStage({ catalogDir, commonsMapFile, log });
}

async function cmdCommonsMap(): Promise<void> {
	const { runCommonsMapStage } = await import('./commons.js');
	const catalogDir = path.resolve(
		arg('out', path.join(here, '..', '..', 'app', 'static', 'catalog'))
	);
	const outFile = path.join(here, '..', '..', 'data', 'commons-map.json');
	await runCommonsMapStage({ catalogDir, outFile, log });
}

async function cmdTagClip(): Promise<void> {
	const { runTagClipStage } = await import('./tagclip.js');
	const catalogDir = path.resolve(
		arg('out', path.join(here, '..', '..', 'app', 'static', 'catalog'))
	);
	await runTagClipStage({
		catalogDir,
		ontologyFile: path.join(here, '..', '..', 'data', 'ontology.json'),
		reportFile: path.join(workDir, 'tagclip-report.json'),
		log
	});
	// The republished index carries a new generatedAt — refresh coverage too.
	await cmdCoverage();
}

async function cmdCurateOnboarding(): Promise<void> {
	const { runCurateOnboarding } = await import('./curate.js');
	const catalogDir = path.resolve(
		arg('out', path.join(here, '..', '..', 'app', 'static', 'catalog'))
	);
	await runCurateOnboarding({
		catalogDir,
		canonFile: path.join(here, '..', '..', 'data', 'canon', 'canon.json'),
		outFile: path.join(here, '..', '..', 'data', 'curated', 'onboarding.json'),
		force: hasFlag('force'),
		log
	});
}

const cmd = process.argv[2];
if (cmd === 'sample') await cmdSample();
else if (cmd === 'build') await cmdBuild();
else if (cmd === 'embed') await cmdEmbed();
else if (cmd === 'commons-map') await cmdCommonsMap();
else if (cmd === 'tag-clip') await cmdTagClip();
else if (cmd === 'curate-onboarding') await cmdCurateOnboarding();
else if (cmd === 'coverage') await cmdCoverage();
else {
	console.error(
		'usage: tsx src/run.ts <sample|build|embed|tag-clip|commons-map|curate-onboarding|coverage> [--limit=N] [--sources=aic,cma] [--out=DIR] [--skip-probe] [--force]'
	);
	process.exit(1);
}
