import { describe, expect, it } from 'vitest';
import {
	calibrateBinary,
	calibrateScale,
	centroid,
	clipConfidence,
	dequantizeRow,
	dot,
	labelForBinary,
	labelForScale,
	quantile
} from '../src/tagclip.js';
import type { Work } from '../src/types.js';

const DIM = 512;

/** Quantize exactly the way the embed stage writes rows. */
function quantizeUnit(unit: number[]): { row: Uint8Array; scale: number } {
	const maxAbs = Math.max(...unit.map(Math.abs)) || 1;
	const row = new Uint8Array(unit.length);
	for (let i = 0; i < unit.length; i++) {
		row[i] = Math.max(0, Math.min(255, Math.round(((unit[i] as number) / maxAbs) * 127 + 128)));
	}
	return { row, scale: maxAbs };
}

function randomUnit(seed: number): number[] {
	// Deterministic pseudo-random vector (LCG), L2-normalized.
	let s = seed;
	const v = Array.from({ length: DIM }, () => {
		s = (s * 1103515245 + 12345) & 0x7fffffff;
		return s / 0x7fffffff - 0.5;
	});
	const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
	return v.map((x) => x / norm);
}

describe('dequantizeRow', () => {
	it('round-trips the embed stage quantization to cosine ≈ 1', () => {
		const unit = randomUnit(7);
		const { row, scale } = quantizeUnit(unit);
		const back = dequantizeRow(row, scale);
		let cos = 0;
		for (let i = 0; i < DIM; i++) cos += (back[i] as number) * (unit[i] as number);
		expect(cos).toBeGreaterThan(0.995);
		// And the result is unit-length.
		expect(Math.abs(dot(back, back) - 1)).toBeLessThan(1e-5);
	});
});

describe('centroid', () => {
	it('is the normalized mean', () => {
		const a = new Float32Array([1, 0, 0]);
		const b = new Float32Array([0, 1, 0]);
		const c = centroid([a, b]);
		expect(c[0]).toBeCloseTo(Math.SQRT1_2, 5);
		expect(c[1]).toBeCloseTo(Math.SQRT1_2, 5);
		expect(c[2]).toBeCloseTo(0, 5);
	});
});

describe('quantile', () => {
	it('reads sorted arrays safely', () => {
		expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
		expect(quantile([1], 0.9)).toBe(1);
		expect(Number.isNaN(quantile([], 0.5))).toBe(true);
	});
});

describe('calibrateBinary', () => {
	// 100 labeled works: positives cluster high, negatives low.
	const margins = [
		...Array.from({ length: 40 }, (_, i) => 0.05 + i * 0.001), // positives
		...Array.from({ length: 60 }, (_, i) => -0.05 + i * 0.001) // negatives
	];
	const labels = [
		...Array.from({ length: 40 }, () => true),
		...Array.from({ length: 60 }, () => false)
	];

	it('calibrates a separable dim and reports precision', () => {
		const c = calibrateBinary(margins, labels);
		expect(c.method).toBe('calibrated');
		expect(c.precision).toBeGreaterThanOrEqual(0.5);
		// The chosen threshold keeps most positives above it.
		expect(margins.filter((m, i) => labels[i] && m >= c.threshold).length).toBeGreaterThanOrEqual(
			20
		);
	});

	it('falls back to a catalog percentile without labeled support', () => {
		const c = calibrateBinary(
			margins,
			margins.map(() => null)
		);
		expect(c.method).toBe('percentile');
		// Top slice only: the threshold sits high in the distribution.
		expect(margins.filter((m) => m >= c.threshold).length / margins.length).toBeLessThanOrEqual(
			0.1
		);
	});

	it('skips a dim whose prompts cannot reach the precision floor', () => {
		// Enough positives to calibrate (≥30), but fully interleaved with the
		// negatives — no threshold reaches the precision floor.
		const mixed = Array.from({ length: 105 }, (_, i) => (i % 2 === 0 ? 0.01 : 0.0101));
		const mixedLabels = Array.from({ length: 105 }, (_, i) => i % 3 === 0); // 1/3 positive everywhere
		const c = calibrateBinary(mixed, mixedLabels);
		expect(c.method).toBe('skipped');
		expect(c.threshold).toBe(Infinity);
	});
});

describe('calibrateScale', () => {
	const margins = [
		...Array.from({ length: 20 }, (_, i) => 0.08 + i * 0.001), // high pole
		...Array.from({ length: 20 }, (_, i) => -0.08 - i * 0.001), // low pole
		...Array.from({ length: 60 }, (_, i) => -0.02 + i * 0.0005) // unlabeled middle
	];
	const labels: ('high' | 'low' | null)[] = [
		...Array.from({ length: 20 }, (): 'high' => 'high'),
		...Array.from({ length: 20 }, (): 'low' => 'low'),
		...Array.from({ length: 60 }, (): null => null)
	];

	it('calibrates a deadband between separated poles with high agreement', () => {
		const c = calibrateScale(margins, labels);
		expect(c.method).toBe('calibrated');
		expect(c.threshold).toBeGreaterThan(c.thresholdLow);
		expect(c.precision).toBeGreaterThan(0.9);
		// The deadband excludes the ambiguous middle.
		expect(c.threshold).toBeGreaterThan(0);
		expect(c.thresholdLow).toBeLessThan(0);
	});

	it('skips when the pole medians are inverted', () => {
		const inverted: ('high' | 'low' | null)[] = labels.map((l) =>
			l === 'high' ? 'low' : l === 'low' ? 'high' : null
		);
		expect(calibrateScale(margins, inverted).method).toBe('skipped');
	});

	it('falls back to per-side percentiles without pole support', () => {
		// Offset distribution: a symmetric ±t band around 0 would be one-sided.
		const offset = margins.map((m) => m + 0.5);
		const c = calibrateScale(
			offset,
			offset.map(() => null)
		);
		expect(c.method).toBe('percentile');
		expect(c.threshold).toBeGreaterThan(c.thresholdLow);
		const high = offset.filter((m) => m >= c.threshold).length;
		const low = offset.filter((m) => m <= c.thresholdLow).length;
		// Both sides select a real minority slice despite the offset.
		expect(high).toBeGreaterThan(0);
		expect(low).toBeGreaterThan(0);
		expect(high / offset.length).toBeLessThanOrEqual(0.2);
		expect(low / offset.length).toBeLessThanOrEqual(0.2);
	});
});

function workWithTags(tags: Record<string, { v: number; c: number; src: 'meta' | 'clip' }>): Work {
	return { tags } as unknown as Work;
}

describe('labeling slices', () => {
	it('binary labels only speak where the metadata covered the group', () => {
		const portrait = workWithTags({ 'subject.portrait': { v: 1, c: 0.75, src: 'meta' } });
		const landscape = workWithTags({ 'subject.landscape': { v: 1, c: 0.75, src: 'meta' } });
		const untagged = workWithTags({});
		const clipOnly = workWithTags({ 'subject.portrait': { v: 1, c: 0.4, src: 'clip' } });
		expect(labelForBinary(portrait, 'subject.portrait')).toBe(true);
		expect(labelForBinary(landscape, 'subject.portrait')).toBe(false);
		expect(labelForBinary(untagged, 'subject.portrait')).toBeNull();
		// clip tags never feed their own calibration.
		expect(labelForBinary(clipOnly, 'subject.portrait')).toBeNull();
	});

	it('scale labels only trust decisive meta values', () => {
		const vivid = workWithTags({ 'color.saturation': { v: 0.9, c: 0.5, src: 'meta' } });
		const muted = workWithTags({ 'color.saturation': { v: 0.2, c: 0.5, src: 'meta' } });
		const middling = workWithTags({ 'color.saturation': { v: 0.5, c: 0.5, src: 'meta' } });
		expect(labelForScale(vivid, 'color.saturation')).toBe('high');
		expect(labelForScale(muted, 'color.saturation')).toBe('low');
		expect(labelForScale(middling, 'color.saturation')).toBeNull();
	});
});

describe('clipConfidence', () => {
	it('stays under every meta confidence tier', () => {
		expect(clipConfidence(0.1, 0.05, 0.2, 'percentile')).toBe(0.35);
		const atThreshold = clipConfidence(0.05, 0.05, 0.2, 'calibrated');
		const wellAbove = clipConfidence(0.2, 0.05, 0.2, 'calibrated');
		expect(atThreshold).toBeCloseTo(0.4, 2);
		expect(wellAbove).toBeCloseTo(0.55, 2);
		expect(wellAbove).toBeLessThan(0.75); // meta taxonomy confidence
	});
});
