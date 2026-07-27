import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadExistingEmbeddings } from '../src/embed.js';

const DIM = 512;
const MODEL = 'Xenova/clip-vit-base-patch32';

async function writeStore(
	dir: string,
	ids: string[],
	overrides: Record<string, unknown> = {},
	binLength = ids.length * DIM
): Promise<void> {
	await writeFile(
		path.join(dir, 'embeddings-meta.json'),
		JSON.stringify({
			model: MODEL,
			dim: DIM,
			count: ids.length,
			failed: 0,
			generatedAt: '2026-07-27T00:00:00.000Z',
			ids,
			scales: ids.map(() => 0.5),
			...overrides
		})
	);
	const bin = new Uint8Array(binLength);
	for (let i = 0; i < bin.length; i++) bin[i] = i % 256;
	await writeFile(path.join(dir, 'embeddings.bin'), bin);
}

describe('loadExistingEmbeddings', () => {
	it('returns null when no store exists', async () => {
		const dir = await mkdtemp(path.join(tmpdir(), 'embed-'));
		expect(await loadExistingEmbeddings(dir)).toBeNull();
	});

	it('round-trips ids, scales and row data', async () => {
		const dir = await mkdtemp(path.join(tmpdir(), 'embed-'));
		await writeStore(dir, ['cma-1', 'cma-2']);
		const store = await loadExistingEmbeddings(dir);
		expect(store).not.toBeNull();
		expect(store?.ids).toEqual(['cma-1', 'cma-2']);
		expect(store?.scales).toEqual([0.5, 0.5]);
		expect(store?.rows).toHaveLength(2);
		// Second row starts where the first ends in the flat matrix.
		expect(store?.rows[1]?.[0]).toBe(DIM % 256);
	});

	it('rejects a store from a different model', async () => {
		const dir = await mkdtemp(path.join(tmpdir(), 'embed-'));
		await writeStore(dir, ['cma-1'], { model: 'some/other-model' });
		expect(await loadExistingEmbeddings(dir)).toBeNull();
	});

	it('rejects a bin whose size disagrees with the meta', async () => {
		const dir = await mkdtemp(path.join(tmpdir(), 'embed-'));
		await writeStore(dir, ['cma-1', 'cma-2'], {}, DIM); // one row short
		expect(await loadExistingEmbeddings(dir)).toBeNull();
	});
});
