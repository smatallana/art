/**
 * en ↔ es parity: identical key trees, identical leaf types, and every
 * template function returns non-empty text for sample inputs. A key added
 * to one language without the other fails HERE (typecheck catches missing
 * es keys; this also catches extras and empty translations).
 */
import { describe, expect, it } from 'vitest';
import { t as en } from './en';
import { es } from './es';

type Tree = Record<string, unknown>;

function keyTree(obj: Tree, prefix = ''): string[] {
	const out: string[] = [];
	for (const [k, v] of Object.entries(obj)) {
		const key = prefix ? `${prefix}.${k}` : k;
		if (v != null && typeof v === 'object' && !Array.isArray(v)) {
			out.push(...keyTree(v as Tree, key));
		} else {
			out.push(`${key}:${typeof v}`);
		}
	}
	return out.sort();
}

function checkLeaves(obj: Tree, path = ''): void {
	for (const [k, v] of Object.entries(obj)) {
		const key = path ? `${path}.${k}` : k;
		if (typeof v === 'string') {
			expect(v.length, key).toBeGreaterThan(0);
		} else if (typeof v === 'function') {
			let result: unknown;
			try {
				result = (v as (...a: unknown[]) => unknown)('sample', 'sample', 'sample');
			} catch {
				result = (v as (...a: unknown[]) => unknown)({});
			}
			expect(typeof result, key).toBe('string');
			expect((result as string).length, key).toBeGreaterThan(0);
		} else if (v != null && typeof v === 'object') {
			checkLeaves(v as Tree, key);
		}
	}
}

describe('i18n parity', () => {
	it('es mirrors the en key tree exactly, leaf types included', () => {
		expect(keyTree(es as unknown as Tree)).toEqual(keyTree(en as unknown as Tree));
	});

	it('every en leaf yields non-empty text', () => {
		checkLeaves(en as unknown as Tree);
	});

	it('every es leaf yields non-empty text', () => {
		checkLeaves(es as unknown as Tree);
	});
});
