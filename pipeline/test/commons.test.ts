import { describe, expect, it } from 'vitest';
import {
	commonsFileFromImageUrl,
	commonsThumbUrl,
	matchSparqlRows,
	pickSearchFile
} from '../src/commons.js';
import { fetchTargetFor } from '../src/embed.js';

describe('commonsFileFromImageUrl', () => {
	it('decodes the filename from a P18 Special:FilePath URL', () => {
		expect(
			commonsFileFromImageUrl(
				'http://commons.wikimedia.org/wiki/Special:FilePath/Nighthawks%20by%20Edward%20Hopper%201942.jpg'
			)
		).toBe('Nighthawks by Edward Hopper 1942.jpg');
	});

	it('rejects non-image files and garbage', () => {
		expect(
			commonsFileFromImageUrl('http://commons.wikimedia.org/wiki/Special:FilePath/Some%20Doc.pdf')
		).toBeNull();
		expect(commonsFileFromImageUrl('not a url')).toBeNull();
	});
});

describe('commonsThumbUrl', () => {
	it('builds an encoded Special:FilePath thumb URL', () => {
		expect(commonsThumbUrl('A (B).jpg')).toBe(
			'https://commons.wikimedia.org/wiki/Special:FilePath/A%20(B).jpg?width=400'
		);
	});
});

describe('matchSparqlRows', () => {
	const row = (aicId: string, file: string) => ({
		aicId: { value: aicId },
		image: { value: `http://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}` }
	});

	it('joins on aic-<id>, first file wins, ignores ids outside the catalog', () => {
		const map = matchSparqlRows(new Set(['aic-100060', 'aic-100061']), [
			row('100060', 'First.jpg'),
			row('100060', 'Second.jpg'),
			row('999999', 'Elsewhere.jpg'),
			row('100061', 'Other work.png')
		]);
		expect(map).toEqual({
			'aic-100060': { file: 'First.jpg', method: 'wikidata' },
			'aic-100061': { file: 'Other work.png', method: 'wikidata' }
		});
	});
});

describe('pickSearchFile', () => {
	it('takes the first usable image and strips the File: prefix', () => {
		expect(pickSearchFile(['File:Doc.pdf', 'File:Painting.tif', 'File:Other.jpg'])).toBe(
			'Painting.tif'
		);
		expect(pickSearchFile(['File:Video.webm'])).toBeNull();
		expect(pickSearchFile([])).toBeNull();
	});
});

describe('fetchTargetFor', () => {
	const commons = { 'aic-1': { file: 'Mapped.jpg', method: 'wikidata' as const } };
	const work = (id: string, thumb: string) => ({ id, images: { thumb } });

	it('routes mapped blocked-host works through Commons', () => {
		expect(fetchTargetFor(work('aic-1', 'https://www.artic.edu/iiif/2/x/full/400,/0/default.jpg'), commons)).toEqual({
			url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Mapped.jpg?width=400',
			origin: 'c'
		});
	});

	it('leaves unmapped blocked-host works on the source URL', () => {
		const t = fetchTargetFor(work('aic-2', 'https://www.artic.edu/iiif/2/y/full/400,/0/default.jpg'), commons);
		expect(t.origin).toBe('s');
		expect(t.url).toContain('artic.edu');
	});

	it('never reroutes unblocked hosts, even when a mapping exists', () => {
		const t = fetchTargetFor(work('aic-1', 'https://openaccess-cdn.clevelandart.org/x/thumb.jpg'), commons);
		expect(t.origin).toBe('s');
		expect(t.url).toContain('clevelandart.org');
	});
});
