/**
 * The curated onboarding collection — the ONLY module that imports the
 * editorial JSON. The engine stays pure: everything downstream receives the
 * collection via SessionContext injection, so unit tests pass synthetic
 * lists and never touch the bundler alias.
 */
import raw from '$data/curated/onboarding.json';
import rawOpening from '$data/curated/opening.json';

export interface CuratedEntry {
	id: string;
	stage: 1 | 2 | 3;
	role: 'anchor' | 'discovery' | 'contrast';
	note?: string;
}

export interface CuratedOnboarding {
	version: number;
	works: CuratedEntry[];
}

export const CURATED_ONBOARDING: CuratedOnboarding = raw as CuratedOnboarding;

export interface OpeningEditorial {
	version: number;
	slots: { name: string; pairs: { a: string; b: string; note?: string }[] }[];
}

export const OPENING_EDITORIAL: OpeningEditorial = rawOpening as OpeningEditorial;
