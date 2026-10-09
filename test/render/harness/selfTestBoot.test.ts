import {describe, expect, it, vi} from 'vitest';
import {bootToSelfTest} from '../../harness/boot';
import {Screen} from '../../harness/render/screen';

describe('bootToSelfTest', () => {
    // 3-4: the self-test page shows OBS out 315° on the left, 3-7: APPROVE? waits for ENT on the right
    it('returns a cold unit on the self-test page, not on its main page (3-4, 3-7)', async () => {
        const unit = await bootToSelfTest();

        const s = Screen.read();
        expect(s.rows('L')).toContain('   OUT 315°');
        expect(s.rows('R').map(r => r.trim())).toContain('APPROVE?');
        // The main page shows its page name at the left of the status line; the self-test page has none
        expect(s.status().left).toBe('');
        expect(unit.errors).toEqual([]);
    });

    it('boots cold and dark whatever engineRunning says', async () => {
        const unit = await bootToSelfTest({engineRunning: true});

        expect(Screen.read().rows('L')).toContain('   OUT 315°');
        expect(unit.errors).toEqual([]);
    });

    it('throws with the screen when the wait is cut short', async () => {
        // The helper has no wait parameter, so the real clock call is shortened from outside: a 19 s advance becomes 10 s,
        // which ends on the Turn-On page
        const advance = vi.advanceTimersByTimeAsync.bind(vi);
        vi.spyOn(vi, 'advanceTimersByTimeAsync').mockImplementation(ms => advance(ms === 19_000 ? 10_000 : ms));

        await expect(bootToSelfTest()).rejects.toThrow(/bootToSelfTest: no APPROVE\? on the self-test page after 19 s\n/);
    });
});
