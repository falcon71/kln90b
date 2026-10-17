import {describe, expect, it, vi} from 'vitest';
import {bootUnit, BootOptions, HeadlessUnit, moveAircraft, settle} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {HEADING_INPUT, panelXml} from '../../../harness/panelXml';

// Source of the expected winds (named again at each test): the wind triangle as a vector sum, computed by hand. The
// wind is the ground vector (GPS ground speed and track) minus the air vector (TAS along the true heading). CAL 3 takes
// the TAS and the magnetic heading from its fields and the ground vector from the GPS.
const POS = {lat: 47.0, lon: 8.0};

/**
 * Enters a TAS in whole hundreds with the knobs. The way to CAL 3 passes CAL 2, which overwrites the
 * CAL 3 TAS when it is shown (#33, Cal2Page.test.ts), so the TAS cannot come from storage.
 */
async function enterTasHundreds(unit: HeadlessUnit, hundreds: number): Promise<void> {
    await unit.panel.cursor('L');
    await unit.panel.inner('L', hundreds);
    await unit.panel.cursor('L');
}

/** Boots with the heading of CAL 3 stored, flies the given ground vector, shows CAL 3 and enters the TAS */
async function cal3(tasHundreds: number, headingMag: number, groundspeedKt: number, trackTrue: number, o: BootOptions = {}): Promise<HeadlessUnit> {
    const unit = await bootUnit({position: POS, ...o, storage: {cal3HeadingMag: headingMag}});
    await settle(unit);
    await moveAircraft(unit, POS, {groundspeedKt, trackTrue});
    await unit.panel.selectPage('L', 'CAL 3');
    await enterTasHundreds(unit, tasHundreds);
    return unit;
}

describe('CAL 3 page (characterization)', () => {
    it('shows the wind for TAS 100 kt, heading 000 and 120 kt over the ground on track 000 (characterization)', async () => {
        const unit = await cal3(1, 0, 120, 0);
        expect(unit.errors).toEqual([]);
        const rows = Screen.read().rows('L');
        expect(rows).toMatchInlineSnapshot(`
          [
            "   WIND    ",
            "TAS   100kt",
            "HDG    000°",
            "TLWND  20kt",
            "WIND  180°¥",
            "       20kt",
          ]
        `);
    });
});

describe('CAL 3 page (5-12)', () => {
    // 5-12: the head- or tailwind component and the wind direction (true) and speed from TAS, heading and the GPS.
    // Source: the vector sum, by hand: air 100 kt north, ground 120 kt north, so the wind blows 20 kt toward the north,
    // from 180, a tailwind of 20 kt
    it('shows TLWND 20kt and a wind from 180 at 20 kt for 120 kt over the ground at TAS 100 (5-12)', async () => {
        await cal3(1, 0, 120, 0);
        const rows = Screen.read().rows('L');
        expect(rows[3]).toBe('TLWND  20kt');
        expect(rows[4]).toMatch(/^WIND +180°/);
        expect(rows[5]).toBe('       20kt');
    });

    // 5-12: the heading entered is magnetic, the wind direction shown is true. With 10 E the heading 000 is 010 true.
    // Source: the vector sum, by hand: air 100 kt on 010 true, ground 80 kt on 010 true, so the wind blows 20 kt toward
    // 190, from 010 true, straight on the nose: HDWND 20. Taking 000 as true would give 25 kt from 327
    it('converts the magnetic heading to true and shows the wind from 010 true at 20 kt, HDWND 20kt (5-12)', async () => {
        const unit = await cal3(1, 0, 80, 10, {magvar: 10});
        expect(unit.props.magvar.getCurrentMagvar()).toBe(10); // The precondition
        const rows = Screen.read().rows('L');
        expect(rows[2]).toBe('HDG    000°');
        expect(rows[3]).toBe('HDWND  20kt');
        expect(rows[4]).toMatch(/^WIND +010°/);
        expect(rows[5]).toBe('       20kt');
    });

    // 5-12, the note on heading sources: with a heading input interfaced, line three is blank and the heading comes
    // from the input. The stored HDG of 090 would give a wind of 156 kt; the gyro heading of 000 gives the tailwind of
    // the first test
    it('leaves line three blank and takes the heading from the heading input (5-12)', async () => {
        const unit = await bootUnit({position: POS, panelXml: panelXml(HEADING_INPUT), storage: {cal3HeadingMag: 90}});
        unit.env.sim.set('PLANE HEADING DEGREES GYRO', 'degrees', 0);
        await settle(unit);
        await moveAircraft(unit, POS, {groundspeedKt: 120, trackTrue: 0});
        await unit.panel.selectPage('L', 'CAL 3');
        await enterTasHundreds(unit, 1);
        const rows = Screen.read().rows('L');
        expect(rows[2]).toBe('           ');
        expect(rows[3]).toBe('TLWND  20kt');
        expect(rows[5]).toBe('       20kt');
    });

    // 5-12, figures 5-37 and 5-38: the wind direction carries the true-north symbol after the degree sign, as on TRI 0.
    // A real unit with a heading input shows WIND, two blanks, the direction, the degree sign and that symbol in eleven
    // cells (reference photo 0283863.jpg)
    it('marks the wind direction as true: WIND  180°¥ (5-12, #249)', async () => {
        await cal3(1, 0, 120, 0);
        expect(Screen.read().rows('L')[4]).toBe('WIND  180°¥');
    });

    // The same row on the page variant with a heading input (the other render branch of the page)
    it('marks the wind direction as true on the page with a heading input too (5-12, #249)', async () => {
        const unit = await bootUnit({position: POS, panelXml: panelXml(HEADING_INPUT), storage: {cal3HeadingMag: 90}});
        unit.env.sim.set('PLANE HEADING DEGREES GYRO', 'degrees', 0);
        await settle(unit);
        await moveAircraft(unit, POS, {groundspeedKt: 120, trackTrue: 0});
        await unit.panel.selectPage('L', 'CAL 3');
        await enterTasHundreds(unit, 1);
        expect(Screen.read().rows('L')[2]).toBe('           '); // The precondition: this is the heading-input variant
        expect(Screen.read().rows('L')[4]).toBe('WIND  180°¥');
    });
});

// #389: CAL 2 can hand CAL 3 a TAS above 999 kt. The 90B's dash forms and widths are not shown by any source
describe('CAL 3 page with a TAS that does not fit its field (characterization, #389)', () => {
    // CAL 2 writes the TAS it calculates to CAL 3 whenever it is shown (#33), and the way to CAL 3 passes it, so the TAS of
    // CAL 3 here comes from the CAL 2 inputs. At 40000 ft, 29.92" and 0 C, CAS 999 kt gives 1063.5 kt, CAS 840 kt gives
    // 999.9 kt (rounded 1000, does not fit) and CAS 839 kt gives 999.4 kt (rounded 999, fits). Source: the CAS to Mach to
    // TAS conversion of data/Conversions.ts, evaluated in a throwaway test run (not by hand)
    const CAL2 = {cal12IndicatedAltitude: 40000, cal12Barometer: 29.92, cal2TAT: 0, cal3HeadingMag: 0};

    /** Boots with CAL 2 inputs that calculate the TAS from the CAS, flies 120 kt on track 000 and shows CAL 3 */
    async function viaCal2(cas: number, o: BootOptions = {}): Promise<HeadlessUnit> {
        const unit = await bootUnit({position: POS, ...o, storage: {...CAL2, cal2Cas: cas}});
        unit.env.sim.set('PLANE HEADING DEGREES GYRO', 'degrees', 0);
        await settle(unit);
        await moveAircraft(unit, POS, {groundspeedKt: 120, trackTrue: 0});
        await unit.panel.selectPage('L', 'CAL 3');
        return unit;
    }

    it('shows dashes for the TAS and for all three wind rows for a TAS of 1063.5 kt (characterization)', async () => {
        const unit = await viaCal2(999);
        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L')).toEqual([
            '   WIND    ',
            'TAS   ---kt',
            'HDG    000°',
            'HDWND ---kt',
            'WIND  ---°¥',
            '      ---kt',
        ]);
    });

    it('shows the same dashes on the page with a heading input (characterization)', async () => {
        await viaCal2(999, {panelXml: panelXml(HEADING_INPUT)});
        expect(Screen.read().rows('L')).toEqual([
            '   WIND    ',
            'TAS   ---kt',
            '           ',
            'HDWND ---kt',
            'WIND  ---°¥',
            '      ---kt',
        ]);
    });

    // The sibling at the boundary: TAS 999.4 kt rounds to 999 and fits. Air 999 kt north, ground 120 kt north: the wind
    // blows 879 kt toward the south, from 000 true, straight on the nose (the vector sum, by hand)
    it('shows numbers in the wind rows for a TAS of 999.4 kt, which rounds to the largest that fits (characterization)', async () => {
        const unit = await viaCal2(839);
        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L')).toEqual([
            '   WIND    ',
            'TAS   999kt',
            'HDG    000°',
            'HDWND 879kt',
            'WIND  000°¥',
            '      879kt',
        ]);
    });

    // The other side of the boundary: TAS 999.9 kt rounds to 1000 and does not fit
    it('shows dashes for a TAS of 999.9 kt, which rounds to 1000 (characterization)', async () => {
        await viaCal2(840);
        const rows = Screen.read().rows('L');
        expect(rows[1]).toBe('TAS   ---kt');
        expect(rows.slice(3)).toEqual(['HDWND ---kt', 'WIND  ---°¥', '      ---kt']);
    });

    // No pilot path changes the TAS under a shown CAL 3 today (the field only takes digits that fit, CAL 2 is another page);
    // this holds the redraw itself: every tick must drop the wind rows when the TAS stops fitting, not only the first one
    it('drops the wind rows to dashes when the stored TAS stops fitting while CAL 3 is shown (characterization)', async () => {
        const unit = await viaCal2(839);
        expect(Screen.read().rows('L').slice(3)).toEqual(['HDWND 879kt', 'WIND  000°¥', '      879kt']); // The precondition
        unit.props.userSettings.getSetting('cal3Tas').set(1063.5);
        await vi.advanceTimersByTimeAsync(2000);
        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L').slice(3)).toEqual(['HDWND ---kt', 'WIND  ---°¥', '      ---kt']);
    });

    // The pilot types a TAS over the dashes: the wind comes back from the entered TAS (the dashed field starts from 000, #257)
    it('brings the wind back when the pilot enters a TAS after the dashes (characterization)', async () => {
        const unit = await viaCal2(999);
        expect(Screen.read().rows('L')[4]).toBe('WIND  ---°¥'); // The precondition
        await enterTasHundreds(unit, 1);
        expect(unit.errors).toEqual([]);
        const rows = Screen.read().rows('L');
        expect(rows[1]).toBe('TAS   100kt');
        expect(rows[3]).toBe('TLWND  20kt');
        expect(rows[4]).toBe('WIND  180°¥');
        expect(rows[5]).toBe('       20kt');
    });
});
