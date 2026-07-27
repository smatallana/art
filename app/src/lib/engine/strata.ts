/**
 * Coverage strata for the calibration phase: era × subject family.
 * Calibration must sweep the space broadly before the model narrows in.
 */
import type { Work } from '../catalog/types';

export type EraBucket = 'pre1500' | 'e1500' | 'e1700' | 'e1850' | 'e1900' | 'unknown';
export type SubjectFamily = 'people' | 'land' | 'interior' | 'still' | 'other';

export function eraBucket(w: Work): EraBucket {
	const y = w.date.start ?? w.date.end;
	if (y == null) return 'unknown';
	if (y < 1500) return 'pre1500';
	if (y < 1700) return 'e1500';
	if (y < 1850) return 'e1700';
	if (y < 1900) return 'e1850';
	return 'e1900';
}

function tagOn(w: Work, dim: string, threshold = 0.5): boolean {
	const t = w.tags[dim];
	return !!t && t.v >= threshold;
}

export function subjectFamily(w: Work): SubjectFamily {
	if (tagOn(w, 'subject.portrait') || tagOn(w, 'subject.figure') || tagOn(w, 'subject.group')) {
		return 'people';
	}
	if (
		tagOn(w, 'subject.landscape') ||
		tagOn(w, 'subject.marine') ||
		tagOn(w, 'subject.cityscape')
	) {
		return 'land';
	}
	if (tagOn(w, 'subject.interior') || tagOn(w, 'subject.genre')) return 'interior';
	if (tagOn(w, 'subject.stilllife')) return 'still';
	return 'other';
}

export function stratumOf(w: Work): string {
	return `${eraBucket(w)}|${subjectFamily(w)}`;
}
