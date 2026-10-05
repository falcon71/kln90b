import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {SuperNav5} from '../../../harness/render/superNav5';
import {SuperNav5Field1} from '../../../../kln90b/settings/KLN90BUserSettings';

// The harness test superNav5.test.ts holds the text of the field without an active waypoint ("-.-NM-") as a
// characterization. This holds the width of the field, which the text must not exceed.
describe('Super NAV 5 field 1 set to XTK without a cross track (eef92e8)', () => {
    // 6-8: the cross track field is six cells wide, the width of the other entries of the field (ETE and VNAV)
    it('is six cells wide', async () => {
        const unit = await bootUnit({storage: {superNav5Field1: SuperNav5Field1.XTK}});
        await unit.panel.selectPage('R', 'NAV 4'); // the right side first: its shorter way passes NAV 5
        await unit.panel.selectPage('L', 'NAV 5');
        await unit.panel.inner('R', 1); // NAV 5 on both sides is Super NAV 5
        await vi.advanceTimersByTimeAsync(250);

        const field = SuperNav5.read().left[4];

        expect(field.length).toBe(6);
    });
});
