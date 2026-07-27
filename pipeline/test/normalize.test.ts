import { describe, expect, it } from 'vitest';
import { aic, aicTagFields, parseAicArtistDisplay } from '../src/sources/aic.js';
import { cma, parseCmaCreator } from '../src/sources/cma.js';
import { WorkSchema } from '../src/types.js';
import { aicNighthawksLike, aicNoImage, cmaNotCc0, cmaTwilightLike } from './fixtures.js';

describe('AIC normalization', () => {
	it('produces a schema-valid work', () => {
		const result = aic.normalize(aicNighthawksLike);
		expect('work' in result).toBe(true);
		if ('work' in result) {
			const w = WorkSchema.parse(result.work);
			expect(w.id).toBe('aic-27992');
			expect(w.artist.name).toBe('Georges Seurat');
			expect(w.artist.born).toBe(1859);
			expect(w.artist.died).toBe(1891);
			expect(w.artist.nationality).toBe('French');
			expect(w.date.start).toBe(1884);
			expect(w.rights.status).toBe('cc0');
			expect(w.images.display).toContain('/full/843,/');
			expect(w.images.thumb).toContain('/full/400,/');
			expect(w.images.full).toContain('/full/1686,/');
			expect(w.images.aspect).toBeCloseTo(1.483, 2);
			expect(w.museum.url).toBe('https://www.artic.edu/artworks/27992');
			expect(w.story).toContain('Seurat');
		}
	});

	it('rejects records without images', () => {
		const result = aic.normalize(aicNoImage);
		expect(result).toEqual({ reject: 'no-image' });
	});

	it('parses artist display vitals', () => {
		expect(parseAicArtistDisplay('Vincent van Gogh\nDutch, 1853–1890')).toEqual({
			nationality: 'Dutch',
			born: 1853,
			died: 1890
		});
		expect(parseAicArtistDisplay(null)).toEqual({ nationality: null, born: null, died: null });
	});

	it('exposes tag fields', () => {
		const f = aicTagFields(aicNighthawksLike);
		expect(f.subjects).toContain('leisure');
		expect(f.styles).toContain('Post-Impressionism');
	});
});

describe('CMA normalization', () => {
	it('produces a schema-valid work with micro-story', () => {
		const result = cma.normalize(cmaTwilightLike);
		expect('work' in result).toBe(true);
		if ('work' in result) {
			const w = WorkSchema.parse(result.work);
			expect(w.id).toBe('cma-126769');
			expect(w.artist.name).toBe('Frederic Edwin Church');
			expect(w.artist.born).toBe(1826);
			expect(w.artist.nationality).toBe('American');
			expect(w.images.width).toBe(3400); // print master, not web derivative
			expect(w.images.full).toContain('print'); // print preferred over TIFF
			expect(w.story).toContain('Civil War');
			expect(w.rights.status).toBe('cc0');
		}
	});

	it('rejects non-CC0 records', () => {
		expect(cma.normalize(cmaNotCc0)).toEqual({ reject: 'not-cc0' });
	});

	it('parses creator descriptions', () => {
		expect(parseCmaCreator('Claude Monet (French, 1840–1926)')).toEqual({
			name: 'Claude Monet',
			nationality: 'French',
			born: 1840,
			died: 1926
		});
		expect(parseCmaCreator(null).name).toBe('Unknown artist');
	});
});
