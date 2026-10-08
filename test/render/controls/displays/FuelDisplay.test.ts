import {describe, expect, it} from 'vitest';
import {FuelFlowDisplay, OthFuelDisplay, TripFuelDisplay} from '../../../../kln90b/controls/displays/FuelDisplay';
import {mount} from '../../../harness/render/mount';
import {UiElement} from '../../../../kln90b/pages/Page';

/** The cells of a display after a display tick */
function shown(el: UiElement): string {
    const m = mount(el);
    m.tick();
    return m.text();
}

// F REQ on TRI 1, TRI 3 and TRI 5
describe('TripFuelDisplay', () => {
    // 5-3, figure 5-6 (F REQ 89.5) and 3-15, figure 3-50 (F REQ 34.4): below 100 the fuel required has a tenth
    it('shows a tenth below 100 (5-3, 3-15)', () => {
        expect(shown(new TripFuelDisplay(89.5))).toBe(' 89.5');
        expect(shown(new TripFuelDisplay(34.4))).toBe(' 34.4');
    });

    // 5-5, figure 5-16 (F REQ 107) and 5-6, figure 5-18 (F REQ 105): from 100 on whole units
    it('shows whole units from 100 on (5-5, 5-6)', () => {
        expect(shown(new TripFuelDisplay(107))).toBe('  107');
        expect(shown(new TripFuelDisplay(100))).toBe('  100');
    });

    // The setup sibling of the pin: 99.94 stays below 100 and keeps its tenth
    it('shows 99.9 just below 100 (5-3)', () => {
        expect(shown(new TripFuelDisplay(99.94))).toBe(' 99.9');
    });

    // 5-3, 5-5: a tenth below 100, whole units from 100 on. 99.97 is below the cutoff, but its tenth rounds up to
    // 100.0, a tenth at 100. Pinned with #226, whose distances have the same cause (the cutoff is checked before the
    // rounding); here the value still fits its five cells. Expected: 100 (rounded) or 99.9 (truncated). Shown on
    // TRI 1, TRI 3 and TRI 5 (F REQ).
    it.fails('shows 99.97 without a tenth or as 99.9 (5-3, 5-5, #226)', () => {
        expect(['  100', ' 99.9']).toContain(shown(new TripFuelDisplay(99.97)));
    });
});

// OTH 5 and OTH 8
describe('OthFuelDisplay', () => {
    // 5-39, figure 5-122 (FOB 126, REQD 90, L FOB 36, EXTRA 6) and 5-41, figure 5-128 (ENG 1 17, TOTAL 33): whole
    // units, right-aligned in five cells
    it('shows whole units right-aligned in five cells (5-39, 5-41)', () => {
        expect(shown(new OthFuelDisplay(126))).toBe('  126');
        expect(shown(new OthFuelDisplay(6))).toBe('    6');
    });
});

// OTH 7
describe('FuelFlowDisplay', () => {
    // 5-41, figures 5-126 and 5-127: the fuel flow per hour in whole units (ENG 1 15, TOTAL 29, 10)
    it('shows the fuel flow in whole units (5-41)', () => {
        expect(shown(new FuelFlowDisplay(15)).trim()).toBe('15');
        expect(shown(new FuelFlowDisplay(29)).trim()).toBe('29');
    });
});

describe('FuelDisplay (characterization)', () => {
    it('characterization: OTH fuel and the fuel flow are rounded to whole units', () => {
        expect(shown(new OthFuelDisplay(16.6))).toBe('   17');
        expect(shown(new FuelFlowDisplay(14.6))).toBe('15  ');
    });

    it('characterization: the fuel flow stands left in four cells', () => {
        expect(shown(new FuelFlowDisplay(15))).toBe('15  ');
        expect(shown(new FuelFlowDisplay(1500))).toBe('1500');
        expect(shown(new FuelFlowDisplay(12345))).toBe('9999');
    });

    it('characterization: OTH and TRI fuel stop at 99999', () => {
        expect(shown(new OthFuelDisplay(123456))).toBe('99999');
        expect(shown(new TripFuelDisplay(123456))).toBe('99999');
    });

    // Negative values (an EXTRA below zero) are left out: what the real unit shows is an open question

    it('characterization: a value set after the render shows at the next display tick', () => {
        const trip = new TripFuelDisplay(null);
        const oth = new OthFuelDisplay(null);
        const flow = new FuelFlowDisplay(0);
        const [mt, mo, mf] = [mount(trip), mount(oth), mount(flow)];
        trip.fuel = 89.5;
        oth.fuel = 126;
        flow.fuelFlow = 15;
        mt.tick();
        mo.tick();
        mf.tick();
        expect([mt.text(), mo.text(), mf.text()]).toEqual([' 89.5', '  126', '15  ']);
    });
});
