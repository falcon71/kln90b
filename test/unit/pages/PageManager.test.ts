import {afterEach, describe, expect, it, vi} from 'vitest';
import {PageManager} from '../../../kln90b/pages/PageManager';
import {EVT_ENT} from '../../../kln90b/HEvents';

afterEach(() => vi.restoreAllMocks());

describe('PageManager', () => {
    // 7b4465d: an aircraft can send H events before the unit is initialized (the Dukes do)
    it('ignores H events before it is initialized (7b4465d)', () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});

        expect(() => new PageManager().onInteractionEvent(EVT_ENT)).not.toThrow();
        expect(err).toHaveBeenCalledWith('Event KLN90B_ENT_Push ignored, we are not yet initialized!');
    });
});
