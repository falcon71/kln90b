import {describe, expect, it} from 'vitest';
import {DurationDisplay, formatDuration} from '../../../../kln90b/controls/displays/DurationDisplay';
import {bootUnit} from '../../../harness/boot';
import {pointFrom} from '../../../harness/flight/geo';
import {airport} from '../../../harness/navdata/builders';
import {mount, mountedText} from '../../../harness/render/mount';
import {Screen} from '../../../harness/render/screen';

/** The five cells of a duration given in minutes, after a display tick */
const shown = (minutes: number | null): string =>
    mountedText(new DurationDisplay(minutes === null ? null : minutes * 60));

describe('DurationDisplay', () => {
    // 3-31, figure 3-97 (ETE 3:34) and 4-11, figure 4-43 (1:21, 2:39): hours and minutes, the hour right-aligned in two
    // cells
    it('shows hours and minutes from one hour on (3-31, 4-11)', () => {
        expect(shown(3 * 60 + 34)).toBe(' 3:34');
        expect(shown(60 + 21)).toBe(' 1:21');
    });

    // 3-31, figure 3-100 (ETE :06), 4-11, figure 4-43 (:11) and 4-13, figure 4-53 (FLT :10): below an hour there is no
    // hour digit
    it('shows only the minutes below an hour (3-31, 4-11, 4-13)', () => {
        expect(shown(6)).toBe('  :06');
        expect(shown(45)).toBe('  :45');
    });

    // 5-7, figure 5-21: 64.8 NM at 145 kt is 26.8 minutes and shows :27, so the minutes are rounded
    it('rounds the minutes (5-7)', () => {
        expect(shown(26.8)).toBe('  :27');
    });

    // 4-8, figure 4-35: 0.4 NM from the waypoint at 182 kt (about 8 seconds) the ETE is :00
    it('shows a few seconds as :00 (4-8)', () => {
        expect(shown(8 / 60)).toBe('  :00');
    });

    // 3-31, figure 3-101: without navigation the ETE is dashed
    it('shows dashes without a value (3-31)', () => {
        expect(shown(null)).toBe('--:--');
    });

    // The setup sibling of the #223 tests below: 59.4 minutes rounds down and stays in the hour
    it('shows 59.4 minutes as :59 (5-7)', () => {
        expect(shown(59.4)).toBe('  :59');
    });

    // 3-31, 5-7: the unit rounds the minutes (the figures of 5-7, and the KLN 89 trainer's CAL 1, 2026-10-12), and the
    // hour rolls over, so the minutes run from 00 to 59: 59.7 minutes are 1:00. Held on NAV 1, OTH 6, TRI 3, D/T 1 and
    // D/T 4 as well.
    it('never shows 60 minutes below an hour (3-31, 5-7, #223)', () => {
        expect(shown(59.7)).toBe(' 1:00');
    });

    // The same rule above an hour: 4 h 59.7 min are 5:00
    it('never shows 60 minutes above an hour (3-31, 5-7, #223)', () => {
        expect(shown(4 * 60 + 59.7)).toBe(' 5:00');
    });

    // 5-7: the minutes are rounded, and the rounding carries into the hour: 59.7 minutes are 1:00 (#223)
    it('carries a rounded 60 minutes into the hour (5-7, #223)', () => {
        expect(formatDuration(59.7 * 60)).toBe(' 1:00');
        expect(formatDuration(119.56 * 60, true)).toBe(' 2:00');
        expect(formatDuration(59.4 * 60)).toBe('  :59');
    });
});

// The trip form of the display (#324) is what the trip pages ask for; the other pages keep the default form
describe('DurationDisplay, trip form', () => {
    const trip = (minutes: number | null): string =>
        mountedText(new DurationDisplay(minutes === null ? null : minutes * 60, true));

    // 3-15, figure 3-50 (0:13) and the KLN 89 trainer, 2026-10-08 (0:31): below an hour the hour digit stays
    it('shows 0:mm below an hour (3-15, checked in the KLN 89 trainer, 2026-10-08, #324)', () => {
        expect(trip(12.96)).toBe(' 0:13');
    });

    // 5-3, figure 5-8 (1:08) and 5-6, figure 5-19 (3:53): from one hour on, h:mm as on the other pages
    it('shows an hour or more as h:mm (5-3, 5-6)', () => {
        expect(trip(60 + 8)).toBe(' 1:08');
        expect(trip(3 * 60 + 53)).toBe(' 3:53');
    });

    it('shows dashes without a value (3-31)', () => {
        expect(trip(null)).toBe('--:--');
    });

    it('characterization: the minutes below an hour at both ends, and dashes from 100 hours on', () => {
        expect(trip(8 / 60)).toBe(' 0:00');
        expect(trip(59.4)).toBe(' 0:59');
        expect(trip(100 * 60)).toBe('--:--');
    });

    // The default form, which NAV 1, the D/T pages and OTH 6 keep
    it('is not the default form: that one keeps the hour blank (3-31)', () => {
        expect(shown(12.96)).toBe('  :13');
    });
});

describe('DurationDisplay (characterization)', () => {
    it('characterization: ten hours and more fill both hour cells', () => {
        expect(shown(12 * 60 + 34)).toBe('12:34');
    });

    it('characterization: 100 hours and more are dashed', () => {
        expect(shown(99 * 60 + 58)).toBe('99:58');
        expect(shown(100 * 60)).toBe('--:--');
    });

    it('characterization: a hidden display shows nothing, and shows its value again once visible', () => {
        const d = new DurationDisplay(45 * 60);
        const m = mount(d);
        d.isVisible = false;
        m.tick();
        expect(m.text()).toBe('');
        d.isVisible = true;
        m.tick();
        expect(m.text()).toBe('  :45');
    });

    it('characterization: a value set after the render shows at the next display tick', () => {
        const d = new DurationDisplay(null);
        const m = mount(d);
        d.time = 45 * 60;
        expect(m.text()).toBe('--:--');
        m.tick();
        expect(m.text()).toBe('  :45');
    });
});

// #257: a duration that cannot be shown shows dashes, as without a value (the KLN 89's CAL 1 showed dashes for an ETE
// out of range and at GS 0, checked in the KLN 89 trainer, 2026-10-17); the 90B's own form is a characterization
describe('formatDuration, a duration that cannot be shown (characterization, #257)', () => {
    it('shows NaN as dashes (characterization, #257)', () => {
        expect(formatDuration(NaN)).toBe('--:--');
    });

    it('shows Infinity as dashes (characterization, #257)', () => {
        expect(formatDuration(Infinity)).toBe('--:--');
    });

    it('shows a negative duration of -60 s as dashes (characterization, #257)', () => {
        expect(formatDuration(-60)).toBe('--:--');
    });
});

// The same DurationDisplay class shows the ETE on the trip pages (TRI 1, 3 and 5), so their format is read on TRI 3,
// which needs no GPS: a trip from KAAA due south at the TAS of 150 kt in no wind, 150 NM an hour
describe('DurationDisplay on the trip pages (TRI 3)', () => {
    const KAAA = {lat: 47.0, lon: 8.0};

    /** The distance row and the ETE cells of TRI 3 for a trip of `nm` NM, after the route is entered */
    async function tri3Trip(nm: number): Promise<{ distance: string, ete: string }> {
        const p = pointFrom(KAAA, 180, nm);
        const unit = await bootUnit({
            facilities: [airport('KAAA', KAAA.lat, KAAA.lon), airport('KBBB', p.lat, p.lon)], coldGps: true,
        });
        await unit.panel.selectPage('L', 'TRI 3');
        await unit.panel.cursor('L');
        await unit.panel.type('L', 'KAAA');
        await unit.panel.ent();
        await unit.panel.ent();
        await unit.panel.type('L', 'KBBB');
        await unit.panel.ent();
        await unit.panel.ent();
        await unit.panel.cursor('L');
        const rows = Screen.read().rows('L');
        expect(rows[2].slice(0, 5)).toBe('150kt'); // The precondition: the TAS is the ground speed
        return {distance: rows[1], ete: rows[2].slice(6)};
    }

    // 5-3, figure 5-8 (ETE 1:08), 5-5, figures 5-12 to 5-16, and 5-6, figures 5-18 and 5-19 (ETE up to 3:53): from one hour on
    // the trip ETE is h:mm. The sibling of the pin: 195 NM at 150 kt is 78 minutes
    it('shows hours and minutes for an ETE above an hour (5-5, 5-6)', async () => {
        expect(await tri3Trip(195)).toEqual({distance: ' 195nm 180°', ete: ' 1:18'});
    });

    // 3-15, figure 3-50: the sibling of the pin, the route and the minutes it relies on. 32.4 NM at 150 kt is 12.96
    // minutes, the :13 of the figure
    it('shows 32.4 NM at 150 kt as 32nm and 13 minutes on the trip page (3-15)', async () => {
        const {distance, ete} = await tri3Trip(32.4);
        expect(distance).toBe('  32nm 180°');
        expect(ete.slice(-3)).toBe(':13');
    });

    // 3-15, figure 3-50 (180kt 0:13 on the trip page) and the KLN 89 trainer, 2026-10-08 (the trip page showed ETE 0:31
    // for 24 NM at 45 kt): below an hour the trip pages keep the hour digit and show 0:mm, where NAV 1 and D/T show :mm
    // (3-31, figure 3-100). 32.4 NM at 150 kt is 12.96 minutes. TRI 1 and TRI 5 are tested in Tri1Page.test.ts and
    // Tri5Page.test.ts.
    it(
        'shows an ETE below an hour as 0:13 on TRI 3 (3-15, checked in the KLN 89 trainer, 2026-10-08, #324)',
        async () => {
            expect(await tri3Trip(32.4)).toEqual({distance: '  32nm 180°', ete: ' 0:13'});
        },
    );
});
