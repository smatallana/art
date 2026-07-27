/** Synthetic works for engine tests — deterministic, no network, no images. */
import type { Tag, Work } from '../catalog/types';

export function testWork(
	id: string,
	overrides: {
		artist?: string;
		year?: number | null;
		aspect?: number;
		tags?: Record<string, number>; // dim → value (c=0.8, src meta)
	} = {}
): Work {
	const tags: Record<string, Tag> = {};
	for (const [dim, v] of Object.entries(overrides.tags ?? {})) {
		tags[dim] = { v, c: 0.8, src: 'meta' };
	}
	return {
		id,
		source: 'dev',
		sourceId: id,
		title: `Work ${id}`,
		artist: {
			name: overrides.artist ?? `Artist ${id}`,
			born: null,
			died: null,
			nationality: null
		},
		date: {
			start: overrides.year === undefined ? 1850 : overrides.year,
			end: null,
			display: String(overrides.year ?? 1850)
		},
		medium: 'Oil on canvas',
		dimensions: null,
		museum: {
			name: 'Test Museum',
			department: null,
			accession: null,
			url: 'https://example.org/w'
		},
		rights: { status: 'cc0', attribution: 'Test — CC0' },
		images: {
			aspect: overrides.aspect ?? 1.3,
			width: 1600,
			height: Math.round(1600 / (overrides.aspect ?? 1.3)),
			thumb: `https://example.org/${id}-t.jpg`,
			display: `https://example.org/${id}.jpg`,
			full: null,
			host: 'dev'
		},
		movement: null,
		culture: null,
		place: null,
		story: null,
		tags,
		quality: { score: 0.7, flags: [] }
	};
}

/** A diversified pool across eras and subject families. */
export function testPool(size = 60): Work[] {
	const works: Work[] = [];
	const eras = [1450, 1600, 1780, 1870, 1930];
	const families: Record<string, number>[] = [
		{ 'subject.portrait': 1, 'subject.figure': 1 },
		{ 'subject.landscape': 1, 'subject.nature': 1 },
		{ 'subject.interior': 1, 'subject.genre': 1 },
		{ 'subject.stilllife': 1 },
		{ 'form.abstraction': 0.9, 'form.geometry': 0.8 }
	];
	// Palettes cycle on a coprime modulus so color decorrelates from era/family.
	const palettes: Record<string, number>[] = [
		{ 'color.saturation': 0.9, 'color.restraint': 0.85 },
		{ 'color.saturation': 0.15, 'color.restraint': 0.2 },
		{ 'color.saturation': 0.55, 'color.temperature': 0.8 }
	];
	for (let i = 0; i < size; i++) {
		works.push(
			testWork(`w${String(i).padStart(3, '0')}`, {
				artist: `Artist ${i % 20}`,
				year: eras[i % eras.length],
				aspect: 0.8 + (i % 5) * 0.2,
				// decorrelate family from era so era×family strata actually vary
				tags: {
					...families[Math.floor(i / eras.length) % families.length],
					...palettes[i % palettes.length]
				}
			})
		);
	}
	return works;
}
