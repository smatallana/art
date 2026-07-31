import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Work } from '../catalog/types';
import { t } from '../i18n/en';
import { blindParts } from './describe';
import { testWork } from './testutil';

describe('blindParts', () => {
	it('composes era, subject, night and mood from tags only', () => {
		const w = testWork('n1', {
			year: 1650,
			tags: { 'subject.landscape': 0.9, 'light.nocturne': 0.8, 'mood.serenity': 0.7 }
		});
		const p = blindParts(w);
		expect(p).toEqual({ era: 'e1500', subject: 'land', night: true, mood: 'serene' });
		expect(t.a11y.artworkBlindDescribed(p!)).toBe(
			'A serene night landscape, from the 1500s or 1600s'
		);
	});

	it('low-confidence tags do not describe; tagless-undated works fall back', () => {
		const faint = testWork('f1', { year: null });
		faint.tags['light.nocturne'] = { v: 0.9, c: 0.2, src: 'clip' };
		expect(blindParts(faint)).toBeNull();
	});

	it('article agrees with the noun phrase', () => {
		const interior = testWork('i1', { year: 1880, tags: { 'subject.interior': 0.9 } });
		expect(t.a11y.artworkBlindDescribed(blindParts(interior)!)).toBe(
			'An interior scene, from the late 1800s'
		);
	});
});

describe('blind descriptions over the committed catalog', () => {
	const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
	const catalogDir = path.join(root, 'app', 'static', 'catalog');
	const index = JSON.parse(readFileSync(path.join(catalogDir, 'index.json'), 'utf8')) as {
		shards: { file: string }[];
	};
	const works: Work[] = index.shards.flatMap(
		(s) => JSON.parse(readFileSync(path.join(catalogDir, s.file), 'utf8')) as Work[]
	);

	it('never leaks identity, and covers most works with a real description', () => {
		// Identity leakage means naming WHICH work this is: the artist or the
		// movement. Generic subject words ("landscape") may legitimately appear
		// in both a title and a description — that reveals content, not
		// identity, which is exactly the brief.
		const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		// Whole-word matching: the surname "Earl" inside "early 1800s" is a
		// substring coincidence, not a leak.
		const asWord = (needle: string) => new RegExp(`\\b${esc(needle.toLowerCase())}\\b`);
		let described = 0;
		for (const w of works) {
			const parts = blindParts(w);
			if (!parts) continue;
			described++;
			const text = t.a11y.artworkBlindDescribed(parts).toLowerCase();
			const surname = w.artist.name.split(/\s+/).pop() ?? '';
			if (surname.length > 3 && w.artist.name !== 'Unknown artist') {
				expect(asWord(surname).test(text), w.id).toBe(false);
			}
			if (w.movement && w.movement.length > 3) {
				expect(asWord(w.movement).test(text), w.id).toBe(false);
			}
		}
		console.log(
			`[describe] ${described} of ${works.length} works get a real blind description ` +
				`(${Math.round((described / works.length) * 100)}%)`
		);
		expect(described / works.length).toBeGreaterThan(0.9);
	});
});
