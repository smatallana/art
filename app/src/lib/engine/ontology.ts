/** Bundled taste ontology (repo-level /data/ontology.json). */
import raw from '$data/ontology.json';
import type { OntologyDim } from './profile';

interface OntologyFile {
	version: number;
	domain: string;
	groups: { id: string; label: string }[];
	dims: (OntologyDim & { poles?: string[] })[];
}

const file = raw as unknown as OntologyFile;

export const ONTOLOGY_VERSION: number = file.version;
export const ONTOLOGY_GROUPS: Map<string, string> = new Map(
	file.groups.map((g) => [g.id, g.label])
);
export const ONTOLOGY_DIMS: OntologyDim[] = file.dims.map((d) => ({
	id: d.id,
	group: d.group,
	kind: d.kind,
	label: d.label,
	poles: d.poles ? [d.poles[0] as string, d.poles[1] as string] : undefined
}));
