import {describe, expect, it} from 'vitest';
import {LatitudeDisplay} from '../../../../kln90b/controls/displays/LatitudeDisplay';
import {mount} from '../../../harness/render/mount';

/** The eleven cells of a latitude in degrees (south negative) after a display tick */
function shown(lat: number | null): string {
    const m = mount(new LatitudeDisplay(lat));
    m.tick();
    return m.text();
}

describe('LatitudeDisplay', () => {
    // 3-8, figure 3-27 (N 41°07.60') and 3-32, figure 3-103 (N 41°00.03'): the hemisphere letter, a blank, two digits
    // of degrees and the minutes to the hundredth
    it('shows a northern latitude in degrees and minutes to the hundredth (3-8, 3-32)', () => {
        expect(shown(41 + 7.6 / 60)).toBe("N 41°07.60'");
        expect(shown(41 + 0.03 / 60)).toBe("N 41°00.03'");
    });

    // 3-8, 3-32: the same with S for a southern latitude (a photo of a real unit, image3-2-scaled.jpeg, shows
    // S 17°06.76')
    it('shows a southern latitude with S (3-8, 3-32)', () => {
        expect(shown(-(17 + 6.76 / 60))).toBe("S 17°06.76'");
    });

    // 3-8, 3-32: the degrees are whole degrees and the minutes the part beyond them, so 41°50' is N 41°50.00' (a
    // latitude of 41.83 does not round up to 42)
    it('truncates the degrees and shows the rest as minutes (3-8, 3-32)', () => {
        expect(shown(41 + 50 / 60)).toBe("N 41°50.00'");
    });

    // 3-8, figure 3-26: before the first fix the latitude is dashed, the blank after the hemisphere kept
    it('shows dashes without a value (3-8)', () => {
        expect(shown(null)).toBe("- --°--.--'");
    });

    // The setup sibling of the #230 pin: 8°30' north shows its minutes
    it('shows the minutes of a latitude below 10 degrees (3-32)', () => {
        expect(shown(8.5).slice(4)).toBe("°30.00'");
    });

    // The Pilot's Guide has no figure of a degree below 10. The KLN 89 trainer (2026-10-07) showed N  8° blank-padded
    // once confirmed, zeros only inside an open edit field. Pinned on NAV 2 as well.
    it.fails(
        'shows a latitude below 10 degrees with a blank (checked in the KLN 89 trainer, 2026-10-07, #230)',
        () => {
            expect(shown(8.5)).toBe("N  8°30.00'");
        },
    );

    // The setup sibling of the #99 pins: just above a whole degree the minutes are 00.00
    it('shows 00.00 minutes just above a whole degree (3-8, 3-32)', () => {
        expect(shown(48 + 0.000001)).toBe("N 48°00.00'");
    });

    // 3-8, 3-32: the minutes run from 00.00 to 59.99. Just below 48° the degrees are floored and the minutes rounded on
    // their own, so they read 60.00. Rounding or truncating are both accepted. Pinned on NAV 2 as well.
    it.fails('never shows 60 minutes (3-8, 3-32, #99)', () => {
        expect(["N 48°00.00'", "N 47°59.99'"]).toContain(shown(48 - 0.000001));
    });
});

// Only the hemisphere cell is asserted: the degrees below 10 are the #230 pin above
describe('LatitudeDisplay at the equator', () => {
    // 3-8, 3-32: the sibling of the pin, a latitude just north of the equator shows N
    it('shows N just north of the equator (3-8, 3-32)', () => {
        expect(shown(0.5).slice(0, 1)).toBe('N');
    });

    // 3-8, 3-32: the sibling of the pin, a latitude just south of the equator shows S
    it('shows S just south of the equator (3-8, 3-32)', () => {
        expect(shown(-0.5).slice(0, 1)).toBe('S');
    });

    // The KLN 89 trainer, 2026-10-08: a latitude entered as S and all zeros was kept as N 0°00.00' once confirmed. The
    // Pilot's Guide has no figure at exactly 0. The code draws S for 0 (the test is "> 0").
    it.fails('shows N at exactly 0 degrees (checked in the KLN 89 trainer, 2026-10-08, #308)', () => {
        expect(shown(0).slice(0, 1)).toBe('N');
    });
});

describe('LatitudeDisplay (characterization)', () => {
    it('characterization: a value set after the render shows at the next display tick', () => {
        const d = new LatitudeDisplay(null);
        const m = mount(d);
        d.latitude = 41 + 7.6 / 60;
        expect(m.text()).toBe("- --°--.--'");
        m.tick();
        expect(m.text()).toBe("N 41°07.60'");
    });
});
