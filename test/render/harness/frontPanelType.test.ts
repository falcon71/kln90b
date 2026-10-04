import {describe, expect, it} from 'vitest';
import {bootUnit} from '../../harness/boot';
import {Screen} from '../../harness/render/screen';
import {airport} from '../../harness/navdata/builders';

describe('FrontPanel.type (harness)', () => {
    it('types an ident into a waypoint selector on the right side', async () => {
        // KAAA is the nearest airport, so it would show without any typing; the test types KBBB
        const unit = await bootUnit({facilities: [airport('KAAA', 47.0, 8.0), airport('KBBB', 48.0, 9.0)]});
        await unit.panel.selectPage('R', 'APT 1');
        await unit.panel.cursor('R');

        await unit.panel.type('R', 'KBBB');

        expect(Screen.read().row(0).slice(12)).toBe(' KBBB      ');
    });

    it('types into the left side with the left cursor on', async () => {
        const unit = await bootUnit({facilities: [airport('KAAA', 47.0, 8.0)]});
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');

        await unit.panel.type('L', 'KAAA');

        expect(Screen.read().row(1).slice(0, 11)).toBe('  1:KAAA   ');
    });
});
