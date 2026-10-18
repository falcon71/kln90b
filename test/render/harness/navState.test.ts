import {describe, expect, it, vi} from 'vitest';
import {hold} from '../../harness/navState';
import {bootOnDtWorld} from '../../harness/worldBoot';

describe('hold (harness)', () => {
    // dtWorld(): ABC is 24 NM ahead at 120 kt, so every calculation tick writes an ETE of about 12 minutes
    it('keeps a NavPageState field at its value over the calculation ticks and ignores writes', async () => {
        const unit = await bootOnDtWorld();
        const navPage = unit.props.memory.navPage;
        expect(navPage.eteToActive).toBeGreaterThan(600); // Precondition: the calculation's value

        hold(navPage, 'eteToActive', 0);
        await vi.advanceTimersByTimeAsync(3000);

        expect(navPage.eteToActive).toBe(0);
        navPage.eteToActive = 42;
        expect(navPage.eteToActive).toBe(0);
    });
});
