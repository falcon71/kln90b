import {describe, expect, it} from 'vitest';
import {MachDisplay, SpeedDisplay} from '../../../../kln90b/controls/displays/SpeedDisplay';
import {mount, mountedText} from '../../../harness/render/mount';

describe('SpeedDisplay', () => {
    // 3-31, figure 3-97 (GS 193kt) and 5-11, figure 5-34 (TAS 158kt): whole knots, right-aligned in three cells
    it('shows whole knots right-aligned in three cells (3-31, 5-11)', () => {
        expect(mountedText(new SpeedDisplay(193))).toBe('193');
        expect(mountedText(new SpeedDisplay(80))).toBe(' 80');
    });

    // A photo of a real unit (546619_af4691d175e44a729ec9461ab899d450_mv2.jpg) shows a parked aircraft's GS as 0KT
    it('shows a ground speed of zero as 0 (photo 546619_af4691d175e44a729ec9461ab899d450_mv2.jpg)', () => {
        expect(mountedText(new SpeedDisplay(0))).toBe('  0');
    });

    // 3-31, figure 3-101: without navigation GS is dashed
    it('shows dashes without a value (3-31)', () => {
        expect(mountedText(new SpeedDisplay(null))).toBe('---');
    });
});

describe('MachDisplay', () => {
    // 5-43, figure 5-130: MACH .34, the decimal point first
    it('shows the Mach number as a point and two digits (5-43)', () => {
        expect(mountedText(new MachDisplay(0.34))).toBe('.34');
    });
});

describe('SpeedDisplay (characterization)', () => {
    // #257 vehicle: this test also held a speed of 1234 as 999 and -5 as 0; a speed that does not fit now shows dashes
    // (the tests below)
    it('characterization: speeds are rounded to the knot', () => {
        expect(mountedText(new SpeedDisplay(144.6))).toBe('145');
    });

    it('characterization: the Mach number stops at .99', () => {
        expect(mountedText(new MachDisplay(1.2))).toBe('.99');
    });

    it('characterization: a value set after the render shows at the next display tick', () => {
        const speed = new SpeedDisplay(null);
        const mach = new MachDisplay(0.34);
        const [ms, mm] = [mount(speed), mount(mach)];
        speed.speed = 193;
        mach.mach = 0.5;
        ms.tick();
        mm.tick();
        expect([ms.text(), mm.text()]).toEqual(['193', '.50']);
    });
});

// #257: a speed that does not fit the three cells shows dashes, as without a value (the KLN 89 shows dashes for its CAL
// values out of range, checked in the KLN 89 trainer, 2026-10-17); the 90B's own form is a characterization
describe('SpeedDisplay, a speed that does not fit (characterization, #257)', () => {
    it('shows 999.4 as 999 (characterization, #257)', () => {
        expect(mountedText(new SpeedDisplay(999.4))).toBe('999');
    });

    it('shows 999.5 as dashes (characterization, #257)', () => {
        expect(mountedText(new SpeedDisplay(999.5))).toBe('---');
    });

    it('shows NaN as dashes (characterization, #257)', () => {
        expect(mountedText(new SpeedDisplay(NaN))).toBe('---');
    });

    it('shows -1 as dashes (characterization, #257)', () => {
        expect(mountedText(new SpeedDisplay(-1))).toBe('---');
    });

    it('shows Infinity as dashes (characterization, #257)', () => {
        expect(mountedText(new SpeedDisplay(Infinity))).toBe('---');
    });
});
