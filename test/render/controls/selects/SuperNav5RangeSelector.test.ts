import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {intersection} from '../../../harness/navdata/builders';
import {showSuperNav5, SuperNav5} from '../../../harness/render/superNav5';
import {savedFlightplan, storedSetting} from '../../../harness/storage';
import {pointFrom} from '../../../harness/flight/geo';

// SuperNav5RangeSelector: the map scale of Super NAV 5 (SuperNav5.read().range), AUTO or a fixed scale, saved as the
// setting superNav5MapRange (0 for AUTO). SuperNav5Page.test.ts holds the list of scales (a characterization, #236),
// AUTO between 1 and 1000 and the AUTO choice of scale; this file holds what the field shows with the cursor on and
// off.

// The AUTO world of SuperNav5Page.test.ts: FPL 0 is AAAA 2 NM south, AAAB 3 NM north (active), AAAC 19.5 NM north, so
// AUTO takes the 20 NM scale
const P = {lat: 47.0, lon: 8.0};
const fix = (ident: string, bearing: number, nm: number) => {
    const at = pointFrom(P, bearing, nm);
    return intersection(ident, at.lat, at.lon);
};

async function superNav5(range: number): Promise<HeadlessUnit> {
    const a0 = fix('AAAA', 180, 2), a1 = fix('AAAB', 0, 3), a2 = fix('AAAC', 0, 19.5);
    const unit = await bootUnit({
        facilities: [a0, a1, a2], position: P,
        storage: {...savedFlightplan(0, [a0, a1, a2]), superNav5MapRange: range},
    });
    await settle(unit);
    await showSuperNav5(unit);
    return unit;
}

describe('Super NAV 5 range selector', () => {
    // 3-36: the left cursor goes over the map scale first; AUTO shows as AUTO there, and with the cursor off the scale
    // AUTO chose shows instead: 20 NM for a waypoint 19.5 NM away
    it('shows AUTO under the cursor and the chosen scale with the cursor off (3-36)', async () => {
        const unit = await superNav5(0);
        expect(SuperNav5.read().range.trim()).toBe('20');
        await unit.panel.cursor('L');
        expect(SuperNav5.focused()).toEqual(['AUTO']);
        await unit.panel.cursor('L');
        expect(SuperNav5.read().range.trim()).toBe('20');
    });

    // 3-36: AUTO picked with the inner knob from the 1 NM scale is kept as AUTO (0) and the map takes its scale
    it('commits AUTO from the 1 NM scale (3-36)', async () => {
        const unit = await superNav5(1);
        await unit.panel.cursor('L');
        expect(SuperNav5.focused()).toEqual(['1   ']);
        await unit.panel.inner('L', -1);
        await unit.panel.cursor('L');
        await vi.advanceTimersByTimeAsync(1000);

        expect(storedSetting(unit, 'superNav5MapRange')).toBe(0);
        expect(SuperNav5.read().range.trim()).toBe('20');
    });

    // 3-35, 3-36: a fixed scale shows itself with the cursor off and on: 15 NM (figure 3-116 shows 15)
    it('shows a fixed scale of 15 NM with the cursor off and on (3-35, 3-36)', async () => {
        const unit = await superNav5(15);
        expect(SuperNav5.read().range.trim()).toBe('15');
        await unit.panel.cursor('L');
        expect(SuperNav5.focused()).toEqual(['15  ']);
    });
});
