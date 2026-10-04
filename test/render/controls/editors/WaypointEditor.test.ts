import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {airport} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';

describe('waypoint editor', () => {
    // 3-14: an entered waypoint is shown on the right for confirmation, and the waypoint on the left flashes meanwhile
    it('flashes the ident of an FPL leg that awaits confirmation (8c3b2e0)', async () => {
        const unit = await bootUnit({facilities: [airport('KAAA', 47.1, 8.0)]});
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.enterIdent('L', 'KAAA');

        await unit.panel.ent();

        // Awaiting the confirmation: the waypoint page of KAAA is on the right
        expect(Screen.read().status().right).toBe('APT 1');
        expect(Screen.read().row(1).slice(0, 9)).toBe('  1:KAAA ');
        // The ident cells are inverted, and flash (inverted blink) on one display tick in four
        const masks: string[] = [];
        for (let i = 0; i < 4; i++) {
            await vi.advanceTimersByTimeAsync(250);
            masks.push(Screen.read().mask().split('\n')[1].slice(4, 9));
        }
        expect(masks.slice().sort()).toEqual(['FFFFF', 'IIIII', 'IIIII', 'IIIII']);
    });
});
