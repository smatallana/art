import { describe, expect, it } from 'vitest';
import { MET_CONFIG, parseCollectionRows, RIJKS_CONFIG } from '../src/sources/collectionwd.js';

const row = (
	qid: string,
	label: string,
	creator: string | null,
	file = 'A painting.jpg',
	links = 20
) => ({
	item: { value: `http://www.wikidata.org/entity/${qid}` },
	itemLabel: { value: label },
	...(creator ? { creatorLabel: { value: creator } } : {}),
	image: {
		value: `http://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}`
	},
	links: { value: String(links) },
	date: { value: '1642-01-01T00:00:00Z' }
});

describe('parseCollectionRows', () => {
	it('parses labeled rows and normalizes creators', () => {
		const rows = parseCollectionRows([
			row('Q219831', 'The Night Watch', 'Rembrandt'),
			row('Q1', 'Q1', 'Rembrandt'), // unlabeled item → dropped
			row('Q2', 'Untitled scroll', null), // no creator → Unknown artist
			row('Q3', 'Court scene', 'India') // culture string → Unknown artist
		]);
		expect(rows.map((r) => r.qid)).toEqual(['Q219831', 'Q2', 'Q3']);
		expect(rows[0]).toMatchObject({
			title: 'The Night Watch',
			artist: 'Rembrandt',
			year: 1642,
			links: 20
		});
		expect(rows[1]?.artist).toBe('Unknown artist');
		expect(rows[2]?.artist).toBe('Unknown artist');
	});

	it('dedupes across pages via the shared seen set', () => {
		const seen = new Set<string>();
		const page1 = parseCollectionRows([row('Q10', 'A', 'X')], seen);
		const page2 = parseCollectionRows([row('Q10', 'A', 'X'), row('Q11', 'B', 'Y')], seen);
		expect(page1).toHaveLength(1);
		expect(page2.map((r) => r.qid)).toEqual(['Q11']);
	});

	it('drops rows without a usable Commons image file', () => {
		const bad = {
			item: { value: 'http://www.wikidata.org/entity/Q77' },
			itemLabel: { value: 'Doc' },
			image: { value: 'http://commons.wikimedia.org/wiki/Special:FilePath/Some%20Doc.pdf' },
			links: { value: '3' }
		};
		expect(parseCollectionRows([bad])).toHaveLength(0);
	});

	it('institution configs carry distinct source tags and honest attribution', () => {
		expect(RIJKS_CONFIG.source).toBe('rijks');
		expect(MET_CONFIG.source).toBe('met');
		expect(RIJKS_CONFIG.attribution).toContain('Wikimedia Commons');
		expect(MET_CONFIG.attribution).toContain('Wikimedia Commons');
	});
});

describe('genid creators and suspect images (T11)', () => {
	it('maps raw blank-node URIs to Unknown artist', () => {
		const rows = parseCollectionRows([
			row(
				'Q10',
				'Crown of thorns',
				'http://www.wikidata.org/.well-known/genid/1dd982bbc481a29647b58069a891aad9'
			)
		]);
		expect(rows[0]?.artist).toBe('Unknown artist');
	});

	it('hard-rejects exhibition-shot filenames at parse time', () => {
		const rows = parseCollectionRows([
			row('Q11', 'Portrait of a man', 'Rembrandt', 'Remember_Me_exhibition,_Rijksmuseum_35.jpg')
		]);
		expect(rows).toEqual([]);
	});
});
