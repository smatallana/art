import { describe, expect, it } from 'vitest';
import { commonsFileFromP18, pickTopWorks, type CanonWorkRow } from '../src/sources/canonwd.js';
import { cma } from '../src/sources/cma.js';
import { dedupe } from '../src/quality.js';
import { cmaTwilightLike } from './fixtures.js';
import type { Work } from '../src/types.js';

describe('commonsFileFromP18', () => {
	it('decodes filenames and rejects non-images', () => {
		expect(
			commonsFileFromP18('http://commons.wikimedia.org/wiki/Special:FilePath/Las%20Meninas.jpg')
		).toBe('Las Meninas.jpg');
		expect(commonsFileFromP18('http://commons.wikimedia.org/wiki/Special:FilePath/plan.svg')).toBeNull();
	});
});

describe('pickTopWorks', () => {
	const row = (qid: string, creator: string, links: number): CanonWorkRow => ({
		qid,
		title: qid,
		creatorQid: creator,
		file: `${qid}.jpg`,
		links,
		year: 1650,
		movement: null,
		collection: null
	});

	it('ranks by sitelinks per creator, respects targets, dedups items', () => {
		const rows = [
			row('Q1', 'A', 5),
			row('Q2', 'A', 90), // most famous
			row('Q2', 'A', 90), // duplicate row
			row('Q3', 'A', 40),
			row('Q4', 'B', 2)
		];
		const picked = pickTopWorks(rows, new Map([['A', 2], ['B', 5]]));
		expect(picked.map((r) => r.qid).sort()).toEqual(['Q2', 'Q3', 'Q4']);
	});
});

describe('cma culture-as-artist cleanup', () => {
	it('keeps parenthetical-form artists intact', () => {
		const res = cma.normalize(cmaTwilightLike);
		expect('work' in res && res.work.artist.name).not.toBe('Unknown artist');
	});

	it('routes bare culture strings to culture, not artist', () => {
		const raw = structuredClone(cmaTwilightLike);
		raw.creators = [{ description: 'India, Rajasthan', role: null }];
		raw.culture = [];
		const res = cma.normalize(raw);
		expect('work' in res).toBe(true);
		if ('work' in res) {
			expect(res.work.artist.name).toBe('Unknown artist');
			expect(res.work.culture).toBe('India, Rajasthan');
		}
	});
});

describe('dedupe drops wd duplicates of museum records', () => {
	function fakeWork(id: string, source: Work['source'], artist: string, title: string): Work {
		const base = cma.normalize(cmaTwilightLike);
		if (!('work' in base)) throw new Error('fixture must normalize');
		return {
			...base.work,
			id,
			source,
			sourceId: id,
			title,
			artist: { ...base.work.artist, name: artist }
		};
	}

	it('same painting via museum + wikidata keeps the museum record only', () => {
		const museum = fakeWork('cma-9', 'cma', 'Vermeer', 'The Lacemaker');
		const wd = fakeWork('wd-Q999', 'wd', 'Vermeer', 'The Lacemaker');
		const other = fakeWork('wd-Q1000', 'wd', 'Vermeer', 'The Astronomer');
		const { works, removed } = dedupe([museum, wd, other]);
		expect(works.map((w) => w.id).sort()).toEqual(['cma-9', 'wd-Q1000']);
		expect(removed).toBe(1);
	});
});
