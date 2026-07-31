/**
 * Identity-neutral visual descriptions for the blind comparison phase.
 * A sighted user sees the whole painting before choosing; a screen-reader
 * user heard only "Painting" / "Painting". These parts give parity —
 * composed ONLY from ontology tags and the era bucket, never from title,
 * artist or movement, so the blind phase stays blind.
 */
import type { Work } from '../catalog/types';
import { eraBucket, subjectFamily, type EraBucket, type SubjectFamily } from './strata';

export interface BlindParts {
	era: EraBucket;
	subject: SubjectFamily;
	night: boolean;
	mood: 'serene' | 'dramatic' | 'mysterious' | 'melancholic' | null;
}

const MIN_V = 0.55;
const MIN_C = 0.35;

function on(w: Work, dim: string): boolean {
	const tag = w.tags[dim];
	return !!tag && tag.c >= MIN_C && tag.v >= MIN_V;
}

/** Null when the work has nothing describable beyond "painting". */
export function blindParts(w: Work): BlindParts | null {
	const subject = subjectFamily(w);
	const night = on(w, 'light.nocturne');
	const mood = on(w, 'mood.drama')
		? ('dramatic' as const)
		: on(w, 'mood.serenity')
			? ('serene' as const)
			: on(w, 'mood.mystery')
				? ('mysterious' as const)
				: on(w, 'mood.melancholy')
					? ('melancholic' as const)
					: null;
	const era = eraBucket(w);
	if (subject === 'other' && !night && !mood && era === 'unknown') return null;
	return { era, subject, night, mood };
}
