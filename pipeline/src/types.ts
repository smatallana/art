import { z } from 'zod';

/** A tag value on a work: value, confidence, and where it came from. */
export const TagSchema = z.object({
	v: z.number().min(0).max(1),
	c: z.number().min(0).max(1),
	src: z.enum(['meta', 'clip', 'curated'])
});
export type Tag = z.infer<typeof TagSchema>;

/** Canonical work record — the single schema every source normalizes into. */
export const WorkSchema = z.object({
	id: z.string(), // e.g. "aic-27992"
	source: z.enum(['aic', 'cma', 'met', 'rijks']),
	sourceId: z.string(),
	title: z.string().min(1),
	artist: z.object({
		name: z.string().min(1), // "Unknown" allowed but explicit
		born: z.number().nullable(),
		died: z.number().nullable(),
		nationality: z.string().nullable()
	}),
	date: z.object({
		start: z.number().nullable(),
		end: z.number().nullable(),
		display: z.string()
	}),
	medium: z.string().nullable(),
	dimensions: z.string().nullable(),
	museum: z.object({
		name: z.string(),
		department: z.string().nullable(),
		accession: z.string().nullable(),
		url: z.string().url() // official page for this work
	}),
	rights: z.object({
		status: z.enum(['cc0', 'public-domain']),
		attribution: z.string() // always shown in the app
	}),
	images: z.object({
		aspect: z.number().positive(), // width / height
		width: z.number().int().positive(), // source master width
		height: z.number().int().positive(),
		thumb: z.string().url(), // ~400px
		display: z.string().url(), // ~840–1200px
		full: z.string().url().nullable(), // largest available
		host: z.enum(['museum', 'r2'])
	}),
	movement: z.string().nullable(),
	culture: z.string().nullable(),
	place: z.string().nullable(),
	story: z.string().nullable(), // one memorable micro-story
	tags: z.record(z.string(), TagSchema),
	quality: z.object({
		score: z.number().min(0).max(1), // composite metadata/image quality
		flags: z.array(z.string())
	})
});
export type Work = z.infer<typeof WorkSchema>;

/** Catalog index — what the app downloads first. */
export interface CatalogIndex {
	schemaVersion: number;
	ontologyVersion: number;
	generatedAt: string;
	count: number;
	shards: { file: string; count: number }[];
	sources: Record<string, { count: number; attribution: string }>;
}

export interface SourceAdapter {
	/** short id, e.g. 'aic' */
	id: Work['source'];
	/** Fetch up to `limit` raw candidate records (paginated internally). */
	fetchRaw(limit: number, log: (msg: string) => void): Promise<unknown[]>;
	/** Fetch a tiny sample for shape inspection. */
	fetchSample(n: number): Promise<unknown[]>;
	/** Normalize one raw record; return null to reject (with reason tracking). */
	normalize(raw: unknown): { work: Work } | { reject: string };
}
