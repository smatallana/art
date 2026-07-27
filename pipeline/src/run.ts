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
import { dedupe, scoreQuality } from './quality.js';
import { publishCatalog } from './publish.js';
import { validateImages } from './validate.js';
import type { SourceAdapter, Work } from './types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const workDir = path.join(here, '..', 'work');

const ADAPTERS: Record<string, SourceAdapter> = { aic, cma };
const TAG_FIELDS: Record<string, (raw: unknown) => { subjects: string[]; styles: string[]; terms: string[] }> = {
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

	for (const id of sources) {
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
			const fields = (TAG_FIELDS[id] as (r: unknown) => { subjects: string[]; styles: string[]; terms: string[] })(raw);
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
	await mkdir(workDir, { recursive: true });
	await writeFile(
		path.join(workDir, 'report.json'),
		JSON.stringify({ index, rejects, dedupeRemoved: removed, dedupeFlagged: flagged, imageReport: report }, null, 2)
	);
	log(`published ${index.count} works → ${outDir}`);
}

async function cmdEmbed(): Promise<void> {
	const { runEmbedStage } = await import('./embed.js');
	const catalogDir = path.resolve(arg('out', path.join(here, '..', '..', 'app', 'static', 'catalog')));
	await runEmbedStage({ catalogDir, log });
}

const cmd = process.argv[2];
if (cmd === 'sample') await cmdSample();
else if (cmd === 'build') await cmdBuild();
else if (cmd === 'embed') await cmdEmbed();
else {
	console.error('usage: tsx src/run.ts <sample|build|embed> [--limit=N] [--sources=aic,cma] [--out=DIR] [--skip-probe]');
	process.exit(1);
}
