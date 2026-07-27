/** Read a published catalog (index + shards) back into memory. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Work } from './types.js';

export async function loadCatalog(catalogDir: string): Promise<Work[]> {
	const index = JSON.parse(await readFile(path.join(catalogDir, 'index.json'), 'utf8')) as {
		shards: { file: string }[];
	};
	const works: Work[] = [];
	for (const s of index.shards) {
		works.push(...(JSON.parse(await readFile(path.join(catalogDir, s.file), 'utf8')) as Work[]));
	}
	return works;
}
