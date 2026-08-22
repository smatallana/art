import { describe, expect, it } from 'vitest';
import { CALIBRATION_TARGET, nextMilestone, PORTRAIT_UNLOCK, RECS_UNLOCK } from './progress';

describe('nextMilestone', () => {
	it('walks the real unlock boundaries', () => {
		expect(nextMilestone(0)).toEqual({ at: RECS_UNLOCK, kind: 'recs' });
		expect(nextMilestone(4)).toEqual({ at: RECS_UNLOCK, kind: 'recs' });
		expect(nextMilestone(5)).toEqual({ at: PORTRAIT_UNLOCK, kind: 'portrait' });
		expect(nextMilestone(7)).toEqual({ at: PORTRAIT_UNLOCK, kind: 'portrait' });
		expect(nextMilestone(8)).toEqual({ at: CALIBRATION_TARGET, kind: 'calibrated' });
		expect(nextMilestone(39)).toEqual({ at: CALIBRATION_TARGET, kind: 'calibrated' });
		expect(nextMilestone(40)).toBeNull();
		expect(nextMilestone(400)).toBeNull();
	});
});
