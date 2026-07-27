/**
 * Catalog types as consumed by the app.
 * Mirror of pipeline/src/types.ts (kept in sync deliberately — the pipeline
 * validates with zod at publish time; the app trusts published data).
 */

export type TagSource = 'meta' | 'clip' | 'curated';

export interface Tag {
	v: number; // value 0..1
	c: number; // confidence 0..1
	src: TagSource;
}

export interface Work {
	id: string;
	source: 'aic' | 'cma' | 'met' | 'rijks' | 'dev';
	sourceId: string;
	title: string;
	artist: {
		name: string;
		born: number | null;
		died: number | null;
		nationality: string | null;
	};
	date: { start: number | null; end: number | null; display: string };
	medium: string | null;
	dimensions: string | null;
	museum: { name: string; department: string | null; accession: string | null; url: string };
	rights: { status: 'cc0' | 'public-domain'; attribution: string };
	images: {
		aspect: number;
		width: number;
		height: number;
		thumb: string;
		display: string;
		full: string | null;
		host: 'museum' | 'r2' | 'dev';
	};
	movement: string | null;
	culture: string | null;
	place: string | null;
	story: string | null;
	tags: Record<string, Tag>;
	quality: { score: number; flags: string[] };
}

export interface CatalogIndex {
	schemaVersion: number;
	ontologyVersion: number;
	generatedAt: string;
	count: number;
	shards: { file: string; count: number }[];
	sources: Record<string, { count: number; attribution: string }>;
}

export interface ArtistEntry {
	slug: string;
	name: string;
	born: number | null;
	died: number | null;
	nationality: string | null;
	workCount: number;
	sampleWorkIds: string[];
}
