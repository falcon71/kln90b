import {describe, expect, it} from 'vitest';
import {LongitudeDisplay} from '../../../../kln90b/controls/displays/LongitudeDisplay';
import {mount} from '../../../harness/render/mount';

/** The eleven cells of a longitude in degrees (west negative) after a display tick */
function shown(lon: number | null): string {
    const m = mount(new LongitudeDisplay(lon));
    m.tick();
    return m.text();
}

// The dashes of a null longitude are pinned in NullDashes.test.ts (#224), which holds the null rows of every display
describe('LongitudeDisplay', () => {
    // 3-8, figure 3-27: the hemisphere letter and three digits of degrees without a blank (W111°58.30'), the minutes to
    // the hundredth
    it('shows a longitude of 100 degrees or more in three digits (3-8)', () => {
        expect(shown(-(111 + 58.3 / 60))).toBe("W111°58.30'");
    });

    // 3-32, figure 3-103: two digits of degrees take the last two of the three cells (W 73°41.62')
    it('shows a longitude below 100 degrees right-aligned in the three cells (3-32)', () => {
        expect(shown(-(73 + 41.62 / 60))).toBe("W 73°41.62'");
    });

    // 3-8, 3-32: E for an eastern longitude (a photo of a real unit, image3-2-scaled.jpeg, shows E179°59.18')
    it('shows an eastern longitude with E (3-8, 3-32)', () => {
        expect(shown(179 + 59.18 / 60)).toBe("E179°59.18'");
    });

    // The setup sibling of the #230 pin: 8 degrees east shows its minutes
    it('shows the minutes of a longitude below 10 degrees (3-32)', () => {
        expect(shown(8.25).slice(4)).toBe("°15.00'");
    });

    // The Pilot's Guide has no figure of a degree below 10. The KLN 89 trainer (2026-10-07) showed W  8° with two
    // blanks once confirmed, zeros only inside an open edit field; a photo of a KLN 90 (0260952.jpg) shows the same
    // blank on NAV 2. Pinned on NAV 2 as well.
    it.fails(
        'shows a longitude below 10 degrees with blanks (checked in the KLN 89 trainer, 2026-10-07, #230)',
        () => {
            expect(shown(8.25)).toBe("E  8°15.00'");
        },
    );

    // The setup sibling of the #99 pin
    it('shows 00.00 minutes just above a whole degree (3-8, 3-32)', () => {
        expect(shown(11 + 0.000001)).toBe("E 11°00.00'");
    });

    // 3-8, 3-32: the minutes run from 00.00 to 59.99; just below 11° they read 60.00. Pinned on NAV 2 as well.
    it.fails('never shows 60 minutes (3-8, 3-32, #99)', () => {
        expect(["E 11°00.00'", "E 10°59.99'"]).toContain(shown(11 - 0.000001));
    });
});

// Only the hemisphere cell is asserted: the degrees below 10 are the #230 pin above
describe('LongitudeDisplay at the meridian of Greenwich', () => {
    // 3-8, 3-32: the sibling of the pin, a longitude just east of the meridian shows E
    it('shows E just east of the meridian (3-8, 3-32)', () => {
        expect(shown(0.5).slice(0, 1)).toBe('E');
    });

    // 3-8, 3-32: the sibling of the pin, a longitude just west of the meridian shows W
    it('shows W just west of the meridian (3-8, 3-32)', () => {
        expect(shown(-0.5).slice(0, 1)).toBe('W');
    });

    // The KLN 89 trainer, 2026-10-08: a longitude entered as W and all zeros was kept as E 0°00.00' once confirmed. The
    // Pilot's Guide has no figure at exactly 0. The code draws W for 0 (the test is "> 0").
    it.fails('shows E at exactly 0 degrees (checked in the KLN 89 trainer, 2026-10-08, #NEW-1-6)', () => {
        expect(shown(0).slice(0, 1)).toBe('E');
    });
});

describe('LongitudeDisplay (characterization)', () => {
    it('characterization: a value set after the render shows at the next display tick', () => {
        const d = new LongitudeDisplay(-(111 + 58.3 / 60));
        const m = mount(d);
        d.longitude = -(73 + 41.62 / 60);
        expect(m.text()).toBe("W111°58.30'");
        m.tick();
        expect(m.text()).toBe("W 73°41.62'");
    });
});
