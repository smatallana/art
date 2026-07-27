/**
 * Generate the committed dev-fixture catalog: 24 deterministic SVG
 * "paintings" spanning eras × subject families, with ontology tags.
 * Used by E2E tests and local dev (museum CDNs are blocked in the sandbox);
 * production loads the real catalog from /catalog when the pipeline has run.
 *
 * Run: node scripts/devcatalog.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const staticDir = path.join(here, '..', 'static');
const artDir = path.join(staticDir, 'dev-art');
const catDir = path.join(staticDir, 'catalog-dev');

const PALETTES = {
	muted: { sky: '#8a8d84', ground: '#5c5648', accent: '#a89877', dark: '#38342c' },
	warm: { sky: '#c9a26a', ground: '#8a5a3c', accent: '#e0c088', dark: '#4a3220' },
	cool: { sky: '#7d93a8', ground: '#48586a', accent: '#b8c6d4', dark: '#2c3844' },
	vivid: { sky: '#d4703c', ground: '#3c78a8', accent: '#e8c832', dark: '#3c2450' },
	dark: { sky: '#3c3a44', ground: '#26242c', accent: '#8a744c', dark: '#141218' }
};

function svgFor(family, palette, w, h, i) {
	const p = PALETTES[palette];
	const bg = `<rect width="${w}" height="${h}" fill="${p.sky}"/>`;
	let body = '';
	if (family === 'land') {
		body = `<rect y="${h * 0.55}" width="${w}" height="${h * 0.45}" fill="${p.ground}"/>
		<circle cx="${w * (0.3 + (i % 3) * 0.2)}" cy="${h * 0.3}" r="${w * 0.08}" fill="${p.accent}"/>
		<path d="M0 ${h * 0.55} Q ${w * 0.3} ${h * 0.42} ${w * 0.55} ${h * 0.55} T ${w} ${h * 0.52} V${h} H0 Z" fill="${p.dark}" opacity="0.55"/>`;
	} else if (family === 'people') {
		body = `<ellipse cx="${w / 2}" cy="${h * 0.38}" rx="${w * 0.16}" ry="${h * 0.14}" fill="${p.dark}"/>
		<path d="M ${w * 0.22} ${h} V ${h * 0.62} Q ${w / 2} ${h * 0.46} ${w * 0.78} ${h * 0.62} V ${h} Z" fill="${p.ground}"/>
		<rect y="${h * 0.86}" width="${w}" height="${h * 0.14}" fill="${p.dark}" opacity="0.35"/>`;
	} else if (family === 'interior') {
		body = `<rect width="${w}" height="${h}" fill="${p.dark}"/>
		<rect x="${w * 0.12}" y="${h * 0.12}" width="${w * 0.3}" height="${h * 0.42}" fill="${p.sky}" opacity="0.85"/>
		<rect x="${w * 0.12}" y="${h * 0.62}" width="${w * 0.76}" height="${h * 0.05}" fill="${p.ground}"/>
		<rect x="${w * 0.2}" y="${h * 0.67}" width="${w * 0.04}" height="${h * 0.25}" fill="${p.ground}"/>
		<rect x="${w * 0.76}" y="${h * 0.67}" width="${w * 0.04}" height="${h * 0.25}" fill="${p.ground}"/>
		<path d="M ${w * 0.12} ${h * 0.12} L ${w * 0.6} ${h * 0.58} L ${w * 0.42} ${h * 0.62} L ${w * 0.12} ${h * 0.54} Z" fill="${p.accent}" opacity="0.25"/>`;
	} else if (family === 'still') {
		body = `<rect y="${h * 0.6}" width="${w}" height="${h * 0.4}" fill="${p.dark}"/>
		<path d="M ${w * 0.3} ${h * 0.6} Q ${w / 2} ${h * 0.78} ${w * 0.7} ${h * 0.6} Z" fill="${p.ground}"/>
		<circle cx="${w * 0.42}" cy="${h * 0.56}" r="${w * 0.06}" fill="${p.accent}"/>
		<circle cx="${w * 0.55}" cy="${h * 0.54}" r="${w * 0.055}" fill="${p.sky}" stroke="${p.dark}" stroke-width="3"/>
		<circle cx="${w * 0.49}" cy="${h * 0.5}" r="${w * 0.045}" fill="${p.ground}"/>`;
	} else {
		// abstract
		body = `<rect x="${w * 0.1}" y="${h * 0.1}" width="${w * 0.45}" height="${h * 0.55}" fill="${p.ground}"/>
		<rect x="${w * 0.5}" y="${h * 0.35}" width="${w * 0.4}" height="${h * 0.3}" fill="${p.accent}" opacity="0.8"/>
		<circle cx="${w * 0.68}" cy="${h * 0.72}" r="${w * 0.12}" fill="${p.dark}"/>
		<rect x="${w * 0.14}" y="${h * 0.72}" width="${w * 0.3}" height="${h * 0.12}" fill="${p.sky}" stroke="${p.dark}" stroke-width="4"/>`;
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${bg}${body}</svg>`;
}

const FAMILY_TAGS = {
	land: { 'subject.landscape': 1, 'subject.nature': 1, 'subject.humanpresence': 0.1 },
	people: { 'subject.portrait': 1, 'subject.figure': 1, 'subject.humanpresence': 0.9 },
	interior: { 'subject.interior': 1, 'subject.genre': 0.8 },
	still: { 'subject.stilllife': 1, 'subject.humanpresence': 0.1 },
	abstract: { 'form.abstraction': 0.9, 'form.geometry': 0.8 }
};
const PALETTE_TAGS = {
	muted: { 'color.saturation': 0.2, 'color.restraint': 0.2 },
	warm: { 'color.temperature': 0.85, 'color.saturation': 0.55 },
	cool: { 'color.temperature': 0.15, 'color.saturation': 0.4 },
	vivid: { 'color.saturation': 0.9, 'color.restraint': 0.85, 'color.protagonism': 0.8 },
	dark: { 'color.value': 0.12, 'light.nocturne': 1, 'mood.mystery': 0.6 }
};
const ASPECTS = { land: 1.45, people: 0.8, interior: 1.1, still: 1.25, abstract: 1.0 };
const ERAS = [1480, 1630, 1780, 1875, 1925];
const FAMILIES = ['land', 'people', 'interior', 'still', 'abstract'];
const PALETTE_NAMES = Object.keys(PALETTES);

await mkdir(artDir, { recursive: true });
await mkdir(catDir, { recursive: true });

const works = [];
let n = 0;
for (const family of FAMILIES) {
	for (let e = 0; e < ERAS.length; e++) {
		if (n >= 24) break;
		const palette = PALETTE_NAMES[(n + e) % PALETTE_NAMES.length];
		const aspect = ASPECTS[family];
		const w = 900;
		const h = Math.round(w / aspect);
		const id = `dev-${String(n).padStart(2, '0')}`;
		const file = `${id}.svg`;
		await writeFile(path.join(artDir, file), svgFor(family, palette, w, h, n));
		const tags = {};
		for (const [dim, v] of Object.entries({ ...FAMILY_TAGS[family], ...PALETTE_TAGS[palette] })) {
			tags[dim] = { v, c: 0.8, src: 'curated' };
		}
		works.push({
			id,
			source: 'dev',
			sourceId: id,
			title: `Study ${n + 1} (${family})`,
			artist: {
				name: `Studio ${String.fromCharCode(65 + (n % 8))}`,
				born: ERAS[e] - 30,
				died: ERAS[e] + 40,
				nationality: null
			},
			date: { start: ERAS[e], end: null, display: String(ERAS[e]) },
			medium: 'Vector study',
			dimensions: null,
			museum: {
				name: 'Beholder Dev Collection',
				department: null,
				accession: id,
				url: 'https://github.com/smatallana/art'
			},
			rights: { status: 'cc0', attribution: 'Beholder dev fixture — CC0' },
			images: {
				aspect,
				width: w,
				height: h,
				thumb: `dev-art/${file}`,
				display: `dev-art/${file}`,
				full: null,
				host: 'dev'
			},
			movement: null,
			culture: null,
			place: null,
			story:
				n % 3 === 0
					? 'A deterministic study generated for development — it stands in for a painting while the real catalog loads.'
					: null,
			tags,
			quality: { score: 0.6, flags: ['dev-fixture'] }
		});
		n++;
	}
}

await writeFile(path.join(catDir, 'works-000.json'), JSON.stringify(works));
await writeFile(
	path.join(catDir, 'index.json'),
	JSON.stringify(
		{
			schemaVersion: 1,
			ontologyVersion: 1,
			generatedAt: '2026-01-01T00:00:00.000Z',
			count: works.length,
			shards: [{ file: 'works-000.json', count: works.length }],
			sources: { dev: { count: works.length, attribution: 'Beholder dev fixture — CC0' } }
		},
		null,
		1
	)
);
console.log(`dev catalog: ${works.length} works → static/catalog-dev + static/dev-art`);
