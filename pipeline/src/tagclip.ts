/**
 * tag-clip stage: zero-shot ontology tags from the COMMITTED image embeddings.
 *
 * Why: 55% of the published catalog carries zero ontology tags (median 0) —
 * metadata-only tagging starves every downstream consumer (session summary,
 * targeted selection, discovery). The image embeddings already exist
 * (embeddings.bin, Xenova/clip-vit-base-patch32); this stage encodes TEXT
 * prompts with the same checkpoint and scores every embedded work by cosine
 * against them. No image is refetched.
 *
 * Honesty rules:
 *   - `meta` tags always win: a clip tag is only written where the dim is
 *     absent. Confidence caps at 0.55, below every meta confidence tier.
 *   - Thresholds are CALIBRATED against the works that carry meta tags
 *     (the well-tagged AIC slice, mostly): a dim ships only if its measured
 *     precision proxy clears a floor, and the numbers go to the report.
 *   - Dims without enough labeled support fall back to a conservative
 *     catalog-percentile threshold and a lower confidence, marked as such.
 *   - Mood/narrative dims beyond a small conservative set are NOT prompted:
 *     zero-shot CLIP is not a reliable instrument for them.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Tag, Work } from './types.js';
import { loadExistingEmbeddings, type EmbeddingStore } from './embed.js';
import { loadCatalog } from './catalog.js';
import { publishCatalog } from './publish.js';

const MODEL = 'Xenova/clip-vit-base-patch32';
const DIM = 512;

/** Labeled examples needed before a dim counts as calibrated. */
const MIN_SUPPORT_BINARY = 30;
const MIN_SUPPORT_SCALE = 10; // per pole
/** A calibrated binary dim must reach this precision proxy to ship. */
const PRECISION_FLOOR = 0.5;
/** Uncalibrated fallback: tag only the top slice of the catalog. */
const PERCENTILE_BINARY = 0.92;
const PERCENTILE_SCALE = 0.85; // of |margin|, both sides

export interface PromptSpec {
	dim: string;
	kind: 'binary' | 'scale' | 'mood';
	/** binary/mood: the positive prompts. scale: the HIGH-pole prompts. */
	pos: string[];
	/** scale only: the LOW-pole prompts. */
	neg?: string[];
}

/** Anchors that absorb the "this is a painting" component of every score. */
export const NEUTRAL_PROMPTS = ['a painting', 'a work of art', 'an oil painting'];

/**
 * The promptable subset of the ontology. Subject binaries are CLIP's sweet
 * spot; form/color scales work as pole pairs; only four moods are attempted,
 * conservatively. Narrative dims are deliberately absent.
 */
export const PROMPTS: PromptSpec[] = [
	// -- subject binaries ---------------------------------------------------
	{
		dim: 'subject.portrait',
		kind: 'binary',
		pos: ['a portrait painting of a person', 'a painted portrait', 'a painting of a person posing']
	},
	{
		dim: 'subject.figure',
		kind: 'binary',
		pos: ['a painting with human figures', 'a painting of people']
	},
	{
		dim: 'subject.group',
		kind: 'binary',
		pos: ['a painting of a group of people', 'a painting of a crowded scene with many people']
	},
	{
		dim: 'subject.landscape',
		kind: 'binary',
		pos: [
			'a landscape painting',
			'a painting of countryside scenery',
			'a painting of hills, fields and sky'
		]
	},
	{
		dim: 'subject.interior',
		kind: 'binary',
		pos: ['a painting of a room interior', 'an interior scene painting']
	},
	{
		dim: 'subject.cityscape',
		kind: 'binary',
		pos: ['a painting of a city street', 'a cityscape painting of buildings and streets']
	},
	{
		dim: 'subject.architecture',
		kind: 'binary',
		pos: ['a painting of a building', 'a painting of a church, cathedral or ruins']
	},
	{
		dim: 'subject.nature',
		kind: 'binary',
		pos: ['a painting of trees and plants', 'a painting of flowers or a garden']
	},
	{
		dim: 'subject.stilllife',
		kind: 'binary',
		pos: [
			'a still life painting',
			'a painting of objects arranged on a table',
			'a painting of fruit or flowers in a vase'
		]
	},
	{
		dim: 'subject.genre',
		kind: 'binary',
		pos: [
			'a genre painting of everyday life',
			'a painting of ordinary people going about daily activities'
		]
	},
	{
		dim: 'subject.religion',
		kind: 'binary',
		pos: [
			'a religious painting',
			'a painting of a biblical scene',
			'a painting of the Madonna, Christ or saints'
		]
	},
	{
		dim: 'subject.myth',
		kind: 'binary',
		pos: [
			'a painting of a mythological scene',
			'a painting of gods and nymphs from classical mythology'
		]
	},
	{
		dim: 'subject.war',
		kind: 'binary',
		pos: ['a painting of a battle', 'a war scene painting with soldiers']
	},
	{
		dim: 'subject.animal',
		kind: 'binary',
		pos: ['a painting of animals', 'a painting of a horse, dog, bird or other animal']
	},
	{
		dim: 'subject.marine',
		kind: 'binary',
		pos: ['a marine painting of the sea', 'a painting of ships on the water', 'a seascape painting']
	},
	{
		dim: 'subject.family',
		kind: 'binary',
		pos: ['a painting of a mother and child', 'an intimate family scene painting']
	},
	// light.nocturne is deliberately NOT clip-prompted: measured against the
	// real catalog it tagged 38% of all works nocturnal (daylight harbors at
	// the confidence ceiling included) and, with clip confidences capped
	// below every usable floor, removal was the only honest lever (T11;
	// meta-sourced nocturne tags remain the dim's only evidence).
	// -- form / color / light scales ---------------------------------------
	{
		dim: 'form.abstraction',
		kind: 'scale',
		neg: ['a realistic figurative painting', 'a naturalistic painting of a recognizable scene'],
		pos: ['an abstract painting', 'a non-representational abstract composition']
	},
	{
		dim: 'form.stylization',
		kind: 'scale',
		neg: ['a highly realistic, lifelike painting'],
		pos: ['a stylized, simplified painting', 'a decorative, flattened, stylized painting']
	},
	{
		dim: 'form.brushwork',
		kind: 'scale',
		neg: ['a painting with a smooth, polished surface and invisible brushwork'],
		pos: [
			'a painting with visible, expressive brushstrokes',
			'a painting with thick impasto brushwork'
		]
	},
	{
		dim: 'form.detail',
		kind: 'scale',
		neg: ['a spare, simple painting with little detail'],
		pos: ['an intricate painting full of fine detail']
	},
	{
		dim: 'form.geometry',
		kind: 'scale',
		neg: ['a painting of soft, organic, flowing forms'],
		pos: ['a painting of geometric shapes and angular forms']
	},
	{
		dim: 'color.saturation',
		kind: 'scale',
		neg: ['a painting in muted, subdued colors', 'a painting with a gray, restrained palette'],
		pos: ['a painting in vivid, saturated colors', 'a brightly colored painting']
	},
	{
		dim: 'color.temperature',
		kind: 'scale',
		neg: ['a painting in cool blue and green tones'],
		pos: ['a painting in warm red, orange and golden tones']
	},
	{
		dim: 'color.value',
		kind: 'scale',
		neg: ['a dark, shadowy painting dominated by blacks and browns'],
		pos: ['a bright, luminous painting full of light']
	},
	{
		dim: 'light.drama',
		kind: 'scale',
		neg: ['a painting with soft, even, diffuse light'],
		pos: [
			'a painting with dramatic, theatrical lighting and deep shadows',
			'a chiaroscuro painting'
		]
	},
	// -- conservative moods -------------------------------------------------
	{ dim: 'mood.serenity', kind: 'mood', pos: ['a serene, peaceful, calm painting'] },
	{ dim: 'mood.melancholy', kind: 'mood', pos: ['a melancholic, sorrowful painting'] },
	{ dim: 'mood.drama', kind: 'mood', pos: ['a dramatic, intense painting of high emotion'] },
	{ dim: 'mood.mystery', kind: 'mood', pos: ['a mysterious, enigmatic painting'] }
];

/** Undo the symmetric int8 quantization and re-normalize to unit length. */
export function dequantizeRow(row: Uint8Array, scale: number): Float32Array {
	const v = new Float32Array(row.length);
	for (let i = 0; i < row.length; i++) v[i] = (((row[i] as number) - 128) / 127) * scale;
	let norm = 0;
	for (let i = 0; i < v.length; i++) norm += (v[i] as number) * (v[i] as number);
	norm = Math.sqrt(norm) || 1;
	for (let i = 0; i < v.length; i++) v[i] = (v[i] as number) / norm;
	return v;
}

export function dot(a: Float32Array, b: Float32Array): number {
	let s = 0;
	for (let i = 0; i < a.length; i++) s += (a[i] as number) * (b[i] as number);
	return s;
}

/** Normalized mean of a set of unit vectors (a prompt-ensemble centroid). */
export function centroid(vectors: Float32Array[]): Float32Array {
	const out = new Float32Array(vectors[0]?.length ?? DIM);
	for (const v of vectors)
		for (let i = 0; i < out.length; i++) out[i] = (out[i] as number) + (v[i] as number);
	let norm = 0;
	for (let i = 0; i < out.length; i++) norm += (out[i] as number) * (out[i] as number);
	norm = Math.sqrt(norm) || 1;
	for (let i = 0; i < out.length; i++) out[i] = (out[i] as number) / norm;
	return out;
}

export function quantile(sorted: number[], q: number): number {
	if (sorted.length === 0) return NaN;
	const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
	return sorted[idx] as number;
}

export interface DimCalibration {
	dim: string;
	kind: PromptSpec['kind'];
	method: 'calibrated' | 'percentile' | 'skipped';
	threshold: number;
	/** scale dims: separate low-pole threshold (margin below it → low pole). */
	thresholdLow?: number;
	support: number;
	/** binary/mood: precision proxy on the labeled slice. scale: side agreement. */
	precision: number | null;
	written: number;
	reason?: string;
}

/**
 * Pick the threshold for a binary/mood dim.
 * Calibrated: the lowest positive-quantile threshold whose precision proxy on
 * the labeled slice clears the floor. Uncalibrated: catalog percentile.
 */
export function calibrateBinary(
	margins: number[], // margin per embedded work, aligned with `labels`
	labels: (boolean | null)[], // true/false where the labeled slice speaks, null outside it
	minSupport = MIN_SUPPORT_BINARY
): {
	method: DimCalibration['method'];
	threshold: number;
	precision: number | null;
	reason?: string;
} {
	const positives = margins.filter((_, i) => labels[i] === true).sort((a, b) => a - b);
	if (positives.length < minSupport) {
		const all = [...margins].sort((a, b) => a - b);
		return { method: 'percentile', threshold: quantile(all, PERCENTILE_BINARY), precision: null };
	}
	// Try progressively stricter thresholds until precision clears the floor.
	for (const q of [0.3, 0.45, 0.6, 0.75, 0.9]) {
		const t = quantile(positives, q);
		let tp = 0;
		let fp = 0;
		for (let i = 0; i < margins.length; i++) {
			if (labels[i] == null || (margins[i] as number) < t) continue;
			if (labels[i]) tp++;
			else fp++;
		}
		const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
		if (precision >= PRECISION_FLOOR) return { method: 'calibrated', threshold: t, precision };
	}
	return {
		method: 'skipped',
		threshold: Infinity,
		precision: null,
		reason: 'precision floor unreachable on the labeled slice'
	};
}

/**
 * Pick the two-sided deadband for a scale dim from labeled pole examples.
 * Falls back to a symmetric catalog percentile when a pole lacks support.
 */
export function calibrateScale(
	margins: number[],
	poleLabels: ('high' | 'low' | null)[],
	minSupport = MIN_SUPPORT_SCALE
): {
	method: DimCalibration['method'];
	threshold: number;
	thresholdLow: number;
	precision: number | null;
	reason?: string;
} {
	const high = margins.filter((_, i) => poleLabels[i] === 'high').sort((a, b) => a - b);
	const low = margins.filter((_, i) => poleLabels[i] === 'low').sort((a, b) => a - b);
	if (high.length < minSupport || low.length < minSupport) {
		// Margin distributions carry prompt-specific offsets, so the fallback
		// band must come from per-side quantiles, never a symmetric ±t around 0.
		const all = [...margins].sort((a, b) => a - b);
		return {
			method: 'percentile',
			threshold: quantile(all, PERCENTILE_SCALE),
			thresholdLow: quantile(all, 1 - PERCENTILE_SCALE),
			precision: null
		};
	}
	const mHigh = quantile(high, 0.5);
	const mLow = quantile(low, 0.5);
	if (!(mHigh > mLow)) {
		return {
			method: 'skipped',
			threshold: Infinity,
			thresholdLow: -Infinity,
			precision: null,
			reason: 'pole medians are not separated — the prompt pair does not resolve this dim'
		};
	}
	// Deadband: the middle half of the separation says nothing.
	const mid = (mHigh + mLow) / 2;
	const delta = (mHigh - mLow) / 4;
	const threshold = mid + delta;
	const thresholdLow = mid - delta;
	let agree = 0;
	let decided = 0;
	for (let i = 0; i < margins.length; i++) {
		const side = poleLabels[i];
		if (side == null) continue;
		const m = margins[i] as number;
		if (m >= threshold) {
			decided++;
			if (side === 'high') agree++;
		} else if (m <= thresholdLow) {
			decided++;
			if (side === 'low') agree++;
		}
	}
	return {
		method: 'calibrated',
		threshold,
		thresholdLow,
		precision: decided > 0 ? agree / decided : null
	};
}

/** Confidence for a written tag: distance above threshold, capped under meta. */
export function clipConfidence(
	margin: number,
	threshold: number,
	p90: number,
	method: DimCalibration['method']
): number {
	if (method === 'percentile') return 0.35;
	const span = p90 - threshold;
	const rel = span > 0 ? Math.min(1, (margin - threshold) / span) : 0;
	return Math.round((0.4 + 0.15 * rel) * 100) / 100;
}

export interface TagClipOptions {
	catalogDir: string;
	ontologyFile: string;
	reportFile: string;
	log: (msg: string) => void;
}

/** Encode all prompt texts with the SAME checkpoint the images used. */
async function encodePrompts(log: (msg: string) => void): Promise<Map<string, Float32Array>> {
	const { AutoTokenizer, CLIPTextModelWithProjection } = await import('@huggingface/transformers');
	log(`loading CLIP text encoder (${MODEL}, quantized)…`);
	const tokenizer = await AutoTokenizer.from_pretrained(MODEL);
	const model = await CLIPTextModelWithProjection.from_pretrained(MODEL, { dtype: 'q8' });
	const texts: string[] = [...NEUTRAL_PROMPTS];
	for (const p of PROMPTS) {
		texts.push(...p.pos);
		if (p.neg) texts.push(...p.neg);
	}
	const inputs = tokenizer(texts, { padding: true, truncation: true });
	const out = (await model(inputs)) as { text_embeds: { data: Float32Array; dims: number[] } };
	const [n, d] = out.text_embeds.dims as [number, number];
	if (n !== texts.length || d !== DIM) {
		throw new Error(`text encoder returned ${n}×${d}, expected ${texts.length}×${DIM}`);
	}
	const byText = new Map<string, Float32Array>();
	for (let i = 0; i < n; i++) {
		const raw = out.text_embeds.data.slice(i * DIM, (i + 1) * DIM);
		let norm = 0;
		for (let j = 0; j < DIM; j++) norm += (raw[j] as number) * (raw[j] as number);
		norm = Math.sqrt(norm) || 1;
		const unit = new Float32Array(DIM);
		for (let j = 0; j < DIM; j++) unit[j] = (raw[j] as number) / norm;
		byText.set(texts[i] as string, unit);
	}
	return byText;
}

/** The labeled slice a dim calibrates against: works whose metadata spoke
 *  about the dim's GROUP at all (their absence of this dim is meaningful). */
function groupOf(dim: string): string {
	return dim.split('.')[0] as string;
}

export function labelForBinary(work: Work, dim: string): boolean | null {
	const covered = Object.keys(work.tags).some(
		(d) => groupOf(d) === groupOf(dim) && work.tags[d]?.src === 'meta'
	);
	if (!covered) return null;
	const t = work.tags[dim];
	return t != null && t.src === 'meta' && t.v >= 0.5;
}

export function labelForScale(work: Work, dim: string): 'high' | 'low' | null {
	const t = work.tags[dim];
	if (!t || t.src !== 'meta') return null;
	if (t.v >= 0.65) return 'high';
	if (t.v <= 0.35) return 'low';
	return null;
}

export async function runTagClipStage(opts: TagClipOptions): Promise<void> {
	const { catalogDir, ontologyFile, reportFile, log } = opts;
	const works = await loadCatalog(catalogDir);
	const store: EmbeddingStore | null = await loadExistingEmbeddings(catalogDir);
	if (!store) throw new Error('no committed embeddings found — run the embed stage first');
	const ontology = JSON.parse(await readFile(ontologyFile, 'utf8')) as { version: number };

	const before = works.filter((w) => Object.keys(w.tags).length > 0).length;
	log(`catalog: ${works.length} works, ${store.ids.length} embedded, ${before} with ≥1 tag`);

	// Dequantized unit vectors, aligned with embedded works.
	const rowIndex = new Map(store.ids.map((id, i) => [id, i]));
	const embedded = works.filter((w) => rowIndex.has(w.id));
	const vectors = embedded.map((w) =>
		dequantizeRow(
			store.rows[rowIndex.get(w.id) as number] as Uint8Array,
			store.scales[rowIndex.get(w.id) as number] as number
		)
	);

	const prompts = await encodePrompts(log);
	const neutral = centroid(NEUTRAL_PROMPTS.map((t) => prompts.get(t) as Float32Array));

	const calibrations: DimCalibration[] = [];
	let totalWritten = 0;

	for (const spec of PROMPTS) {
		const pos = centroid(spec.pos.map((t) => prompts.get(t) as Float32Array));
		const ref =
			spec.kind === 'scale'
				? centroid((spec.neg as string[]).map((t) => prompts.get(t) as Float32Array))
				: neutral;
		const margins = vectors.map((v) => dot(v, pos) - dot(v, ref));

		let cal: DimCalibration;
		if (spec.kind === 'scale') {
			const labels = embedded.map((w) => labelForScale(w, spec.dim));
			const c = calibrateScale(margins, labels);
			cal = {
				dim: spec.dim,
				kind: spec.kind,
				support: labels.filter(Boolean).length,
				written: 0,
				...c
			};
		} else {
			const labels = embedded.map((w) => labelForBinary(w, spec.dim));
			const c = calibrateBinary(margins, labels);
			cal = {
				dim: spec.dim,
				kind: spec.kind,
				support: labels.filter((l) => l === true).length,
				written: 0,
				...c
			};
		}

		if (cal.method !== 'skipped') {
			const sortedMargins = [...margins].sort((a, b) => a - b);
			const p90 = quantile(sortedMargins, 0.9);
			const p10 = quantile(sortedMargins, 0.1);
			for (let i = 0; i < embedded.length; i++) {
				const w = embedded[i] as Work;
				if (w.tags[spec.dim]) continue; // meta (or earlier) wins, always
				const m = margins[i] as number;
				let tag: Tag | null = null;
				if (spec.kind === 'scale') {
					if (m >= cal.threshold) {
						tag = { v: 0.8, c: clipConfidence(m, cal.threshold, p90, cal.method), src: 'clip' };
					} else if (m <= (cal.thresholdLow as number)) {
						tag = {
							v: 0.2,
							c: clipConfidence(-m, -(cal.thresholdLow as number), -p10, cal.method),
							src: 'clip'
						};
					}
				} else if (m >= cal.threshold) {
					tag = {
						v: spec.kind === 'mood' ? 0.7 : 1,
						c: clipConfidence(m, cal.threshold, p90, cal.method),
						src: 'clip'
					};
				}
				if (tag) {
					w.tags[spec.dim] = tag;
					cal.written++;
					totalWritten++;
				}
			}
		}
		calibrations.push(cal);
		log(
			`${spec.dim}: ${cal.method}` +
				(cal.precision != null ? ` precision≈${cal.precision.toFixed(2)}` : '') +
				` support=${cal.support} written=${cal.written}` +
				(cal.reason ? ` (${cal.reason})` : '')
		);
	}

	const after = works.filter((w) => Object.keys(w.tags).length > 0).length;
	const counts = works.map((w) => Object.keys(w.tags).length).sort((a, b) => a - b);
	const median = counts[Math.floor(counts.length / 2)] as number;
	log(
		`tags written: ${totalWritten} across ${calibrations.filter((c) => c.written > 0).length} dims; ` +
			`works with ≥1 tag: ${before} → ${after} of ${works.length}; median tags/work now ${median}`
	);

	await publishCatalog(works, catalogDir, ontology.version);
	log('catalog republished with clip tags (meta untouched)');

	await mkdir(path.dirname(reportFile), { recursive: true });
	await writeFile(
		reportFile,
		JSON.stringify(
			{
				generatedAt: new Date().toISOString(),
				model: MODEL,
				embedded: embedded.length,
				worksTotal: works.length,
				taggedBefore: before,
				taggedAfter: after,
				medianTagsPerWork: median,
				totalWritten,
				dims: calibrations
			},
			null,
			1
		)
	);
	log(`calibration report → ${reportFile}`);
}
