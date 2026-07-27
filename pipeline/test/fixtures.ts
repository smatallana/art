/**
 * Realistic raw-record fixtures for unit tests.
 * Shapes mirror the official APIs; verified against live samples fetched in CI
 * (see .github/workflows/pipeline.yml `sample` mode).
 */
import type { AicRecord } from '../src/sources/aic.js';
import type { CmaRecord } from '../src/sources/cma.js';

export const aicNighthawksLike: AicRecord = {
	id: 27992,
	title: 'A Sunday on La Grande Jatte — 1884',
	artist_display: 'Georges Seurat\nFrench, 1859–1891',
	artist_title: 'Georges Seurat',
	date_start: 1884,
	date_end: 1886,
	date_display: '1884–86',
	medium_display: 'Oil on canvas',
	dimensions: '207.5 × 308.1 cm (81 3/4 × 121 1/4 in.)',
	image_id: '2d484387-2509-5e8e-2c43-22f9981972eb',
	thumbnail: { width: 15226, height: 10264, alt_text: 'Large painting of people in a park.' },
	is_public_domain: true,
	department_title: 'Painting and Sculpture of Europe',
	main_reference_number: '1926.224',
	place_of_origin: 'Paris',
	style_title: 'Post-Impressionism',
	style_titles: ['Post-Impressionism'],
	subject_titles: ['leisure', 'water', 'landscapes'],
	classification_titles: ['painting', 'modern and contemporary art'],
	term_titles: ['painting', 'oil on canvas'],
	artwork_type_title: 'Painting',
	description: '<p>In his best-known and largest painting, Georges Seurat depicted people from different social classes strolling and relaxing in a park.</p>',
	short_description: 'Georges Seurat depicted people relaxing in a park on an island in the Seine.',
	credit_line: 'Helen Birch Bartlett Memorial Collection'
};

export const aicNoImage: AicRecord = {
	...aicNighthawksLike,
	id: 99999,
	image_id: null
};

export const cmaTwilightLike: CmaRecord = {
	id: 126769,
	accession_number: '1965.233',
	title: 'Twilight in the Wilderness',
	creation_date: '1860',
	creation_date_earliest: 1860,
	creation_date_latest: 1860,
	creators: [
		{
			description: 'Frederic Edwin Church (American, 1826–1900)',
			role: 'artist'
		}
	],
	culture: ['America, 19th century'],
	technique: 'oil on canvas',
	department: 'American Painting and Sculpture',
	type: 'Painting',
	measurements: 'Unframed: 101.6 x 162.6 cm',
	images: {
		web: {
			url: 'https://openaccess-cdn.clevelandart.org/1965.233/1965.233_web.jpg',
			width: '893',
			height: '558'
		},
		print: {
			url: 'https://openaccess-cdn.clevelandart.org/1965.233/1965.233_print.jpg',
			width: '3400',
			height: '2126'
		},
		full: {
			url: 'https://openaccess-cdn.clevelandart.org/1965.233/1965.233_full.tif',
			width: '7515',
			height: '4699'
		}
	},
	share_license_status: 'CC0',
	url: 'https://clevelandart.org/art/1965.233',
	tombstone:
		'Twilight in the Wilderness, 1860. Frederic Edwin Church (American, 1826–1900). Oil on canvas.',
	did_you_know:
		'Church painted this brilliant sunset over an untouched American landscape on the eve of the Civil War.',
	fun_fact: null,
	wall_description: 'A blazing sunset in the American wilderness with no trace of humanity.'
};

export const cmaNotCc0: CmaRecord = {
	...cmaTwilightLike,
	id: 555,
	share_license_status: 'copyrighted'
};
