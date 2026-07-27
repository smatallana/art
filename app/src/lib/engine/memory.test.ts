import { describe, expect, it } from 'vitest';
import type { AppEvent } from './events';
import { dueItems, INTERVALS_DAYS, KNOWN_LEVEL, knownItems, memoryItems } from './memory';

const T0 = new Date('2026-01-01T12:00:00Z');

function ev(daysAfterT0: number, payload: Record<string, unknown>): AppEvent {
	return {
		id: crypto.randomUUID(),
		at: new Date(T0.getTime() + daysAfterT0 * 86400000).toISOString(),
		device: 'd',
		hour: 12,
		...payload
	} as AppEvent;
}

describe('memory scheduling', () => {
	it('a remembered work becomes due after the first interval', () => {
		const events = [ev(0, { t: 'remember', work: 'w1' })];
		expect(dueItems(events, new Date(T0.getTime() + 0.5 * 86400000))).toHaveLength(0);
		const due = dueItems(events, new Date(T0.getTime() + 1.1 * 86400000));
		expect(due.map((i) => i.work)).toEqual(['w1']);
	});

	it('recognized advances the level; intervals stretch', () => {
		const events = [
			ev(0, { t: 'remember', work: 'w1' }),
			ev(1, { t: 'memory_review', work: 'w1', outcome: 'recognized' }),
			ev(4, { t: 'memory_review', work: 'w1', outcome: 'recognized' })
		];
		const [item] = memoryItems(events);
		expect(item!.level).toBe(2);
		// due 7 days after the last review (level-2 interval)
		const dueMs = new Date(item!.dueAt).getTime();
		expect(dueMs).toBe(new Date(events[2]!.at).getTime() + INTERVALS_DAYS[2]! * 86400000);
	});

	it('missed resets to the shortest interval; partial holds level', () => {
		const events = [
			ev(0, { t: 'remember', work: 'w1' }),
			ev(1, { t: 'memory_review', work: 'w1', outcome: 'recognized' }),
			ev(4, { t: 'memory_review', work: 'w1', outcome: 'missed' })
		];
		expect(memoryItems(events)[0]!.level).toBe(0);
		const events2 = [
			ev(0, { t: 'remember', work: 'w2' }),
			ev(1, { t: 'memory_review', work: 'w2', outcome: 'recognized' }),
			ev(4, { t: 'memory_review', work: 'w2', outcome: 'partial' })
		];
		expect(memoryItems(events2)[0]!.level).toBe(1);
	});

	it('a work becomes "known" at the threshold level', () => {
		const events: AppEvent[] = [ev(0, { t: 'remember', work: 'w1' })];
		let day = 1;
		for (let i = 0; i < KNOWN_LEVEL; i++) {
			events.push(ev(day, { t: 'memory_review', work: 'w1', outcome: 'recognized' }));
			day += INTERVALS_DAYS[i + 1] ?? 30;
		}
		expect(knownItems(events).map((i) => i.work)).toEqual(['w1']);
	});

	it('reviews of unremembered works are ignored; most overdue first', () => {
		const events = [
			ev(0, { t: 'memory_review', work: 'ghost', outcome: 'recognized' }),
			ev(0, { t: 'remember', work: 'a' }),
			ev(2, { t: 'remember', work: 'b' })
		];
		const due = dueItems(events, new Date(T0.getTime() + 10 * 86400000));
		expect(due.map((i) => i.work)).toEqual(['a', 'b']);
	});
});
