import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildArtists, publishCatalog, artistSlug } from '../src/publish.js';
import { dedupe, scoreQuality } from '../src/quality.js';
import type { Work } from '../src/types.js';
import { aic } from '../src/sources/aic.js';
import { aicNighthawksLike } from './fixtures.js';

function makeWork(id: string, artist = 'Test Artist', title = `Work ${id}`): Work {
	const base = aic.normalize(aicNighthawksLike);
	if (!('work' in base)) throw new Error('fixture must normalize');
	return {
		...base.work,
		id,
		sourceId: id,
		title,
		artist: { ...base.work.artist, name: artist }
	};
}

describe('dedupe', () => {
	it('removes identical ids and flags cross collisions', () => {
		const a = makeWork('aic-1', 'Monet', 'Water Lilies');
		const b = makeWork('aic-1', 'Monet', 'Water Lilies'); // identical id
		const c = makeWork('cma-2', 'Monet', 'Water Lilies'); // same artist+title, other museum
		const { works, removed, flagged } = dedupe([a, b, c]);
		expect(removed).toBe(1);
		expect(works).toHaveLength(2);
		expect(flagged).toBe(2);
		expect(works.every((w) => w.quality.flags.includes('possible-duplicate'))).toBe(true);
	});
});

describe('scoreQuality', () => {
	it('rewards resolution, story and tags; flags problems', () => {
		const good = scoreQuality(makeWork('aic-3'));
		expect(good.quality.score).toBeGreaterThan(0.5);
		const bad = scoreQuality({
			...makeWork('aic-4', 'Unknown artist'),
			images: { ...makeWork('aic-4').images, width: 800 },
			story: null,
			date: { start: null, end: null, display: 'date unknown' }
		});
		expect(bad.quality.flags).toContain('unknown-artist');
		expect(bad.quality.flags).toContain('no-date');
		expect(bad.quality.score).toBeLessThan(0.5);
	});
});

describe('publishCatalog', () => {
	it('shards deterministically and writes a coherent index', async () => {
		const out = await mkdtemp(path.join(tmpdir(), 'beholder-catalog-'));
		const works = Array.from({ length: 5 }, (_, i) => makeWork(`aic-${i}`));
		const index = await publishCatalog(works, out, 1);
		expect(index.count).toBe(5);
		expect(index.shards).toHaveLength(1);
		const shard = JSON.parse(
			await readFile(path.join(out, (index.shards[0] as { file: string }).file), 'utf8')
		);
		expect(shard).toHaveLength(5);
		expect(shard[0].id < shard[1].id).toBe(true);
		const artists = JSON.parse(await readFile(path.join(out, 'artists.json'), 'utf8'));
		expect(artists[0].workCount).toBe(5);
	});
});

describe('artistSlug', () => {
	it('normalizes diacritics and punctuation', () => {
		expect(artistSlug('Jean-Honoré Fragonard')).toBe('jean-honore-fragonard');
		expect(artistSlug('Vilhelm Hammershøi')).toBe('vilhelm-hammersh-i');
	});
});
