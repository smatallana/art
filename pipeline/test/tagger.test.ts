import { describe, expect, it } from 'vitest';
import { tagFromMetadata } from '../src/tagger.js';

describe('tagFromMetadata', () => {
	it('maps curated subject taxonomy with high confidence', () => {
		const tags = tagFromMetadata({
			title: 'The Herring Net',
			movement: null,
			culture: null,
			medium: 'Oil on canvas',
			subjects: ['landscapes', 'work'],
			styles: [],
			terms: []
		});
		expect(tags['subject.landscape']).toMatchObject({ v: 1, c: 0.75, src: 'meta' });
		expect(tags['subject.labor']).toMatchObject({ v: 1, c: 0.75 });
	});

	it('keyword-scans titles with lower confidence', () => {
		const tags = tagFromMetadata({
			title: 'Nocturne in Black and Gold',
			movement: null,
			culture: null,
			medium: null,
			subjects: [],
			styles: [],
			terms: []
		});
		expect(tags['light.nocturne']).toMatchObject({ v: 1, c: 0.5 });
	});

	it('higher-confidence claims win over keyword hits', () => {
		const tags = tagFromMetadata({
			title: 'Portrait of a Lady',
			movement: null,
			culture: null,
			medium: null,
			subjects: ['portraits'],
			styles: [],
			terms: []
		});
		expect(tags['subject.portrait']?.c).toBe(0.75);
	});

	it('derives human presence from figure evidence', () => {
		const withFigure = tagFromMetadata({
			title: 'X',
			movement: null,
			culture: null,
			medium: null,
			subjects: ['portraits'],
			styles: [],
			terms: []
		});
		expect(withFigure['subject.humanpresence']?.v).toBeGreaterThan(0.7);

		const landscapeOnly = tagFromMetadata({
			title: 'Hills',
			movement: null,
			culture: null,
			medium: null,
			subjects: ['landscapes'],
			styles: [],
			terms: []
		});
		expect(landscapeOnly['subject.humanpresence']?.v).toBeLessThan(0.3);
	});

	it('applies style hints weakly', () => {
		const tags = tagFromMetadata({
			title: 'Water Lilies',
			movement: 'Impressionism',
			culture: null,
			medium: null,
			subjects: [],
			styles: [],
			terms: []
		});
		expect(tags['form.brushwork']).toMatchObject({ v: 0.8, c: 0.4 });
	});
});
