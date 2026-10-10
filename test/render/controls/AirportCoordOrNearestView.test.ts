import {describe, expect, it, vi} from 'vitest';
import {BoundaryFacility, BoundaryType} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit} from '../../harness/boot';
import {Screen} from '../../harness/render/screen';
import {airport} from '../../harness/navdata/builders';
import {airspace} from '../../harness/navdata/airspaces';

const POS = {lat: 47.0, lon: 12.0};

/**
 * A triangle with the corners 47.2 N 11.8 E, 47.2 N 12.2 E and 46.8 N 11.8 E. KIN lies inside it; KOUT lies inside its
 * bounding box (46.8 to 47.2 N, 11.8 to 12.2 E) but south-east of the long side, outside the airspace.
 */
const triangle = (name: string, type: BoundaryType) => airspace(name, type, [[47.2, 11.8], [47.2, 12.2], [46.8, 11.8]]);
const kin = () => airport('KIN', 47.1, 11.9);
const kout = () => airport('KOUT', 46.85, 12.15);

/** APT 1 on the first airport of the scan list (alphabetical), after the airspace search has finished */
const showApt1 = (unit: HeadlessUnit): Promise<string[]> => unit.panel.show('R', 'APT 1', {waitMs: 2000});

/** The next airport of the complete list with the pulled right inner knob (3-21), after its airspace search */
async function scanToNext(unit: HeadlessUnit): Promise<string[]> {
    await unit.panel.scan();
    await unit.panel.inner('R', 1);
    await unit.panel.scan();
    await vi.advanceTimersByTimeAsync(2000);
    return Screen.read().rows('R');
}

async function bootWith(airspaces: BoundaryFacility[], first = kin(), second = kout()): Promise<HeadlessUnit> {
    return bootUnit({facilities: [first, second], position: POS, altitudeFt: 0, airspaces});
}

describe('APT 1 airspace row (3-42)', () => {
    // 3-42: an airport under the outer boundary of a Class C airspace shows CL C on the left side of the third row
    it('shows CL C for an airport under a Class C airspace (3-42)', async () => {
        const unit = await bootWith([triangle('TEST CLASS C', BoundaryType.ClassC)]);

        expect((await showApt1(unit))[3]).toBe('CL C       ');
    });

    // 3-42: CTA (control area) and TMA (terminal area) are the names used outside the USA. The code recognizes them by
    // the airspace's name, so the airspaces carry the word in their names
    it.each([
        ['ZURICH CTA', 'CTA        '],
        ['ZURICH TMA', 'TMA        '],
    ])('shows %s as its kind on the left of the row (3-42)', async (name, row) => {
        const unit = await bootWith([triangle(name, BoundaryType.ClassD)]);

        expect((await showApt1(unit))[3]).toBe(row);
    });

    // 3-42: the row names only the airspace the airport lies under; KOUT is under none
    it('leaves the row blank for an airport outside the airspace, shown first (3-42)', async () => {
        // The scan list is alphabetical, so it opens on KOUT when KIN is renamed to sort after it
        const unit = await bootWith([triangle('TEST CLASS C', BoundaryType.ClassC)], airport('KZIN', 47.1, 11.9),
            kout());

        expect(await showApt1(unit)).toEqual(
            [' KOUT      ', 'KOUT AIRPT ', '           ', '           ', 'N 46°51.00\'', 'E 12°09.00\'']);
    });
});

// #102: NearestUtils.getAirspaces keeps one search session and one result map for every caller. The session reports
// only what was added or removed since the last search, and the map takes an added airspace only if the search point
// lies inside it
describe('APT 1 airspace row after another airport (#102)', () => {
    // 3-42: the preconditions of the first pin below, KIN under the Class C and KOUT next on the scan
    it('shows CL C for KIN, then KOUT on the scan (sibling of the first #102 pin) (3-42)', async () => {
        const unit = await bootWith([triangle('TEST CLASS C', BoundaryType.ClassC)]);

        const rows = await showApt1(unit);
        expect([rows[0], rows[3]]).toEqual([' KIN       ', 'CL C       ']);
        expect((await scanToNext(unit))[0]).toBe(' KOUT      ');
    });

    // 3-42: KOUT lies under no airspace; the Class C of KIN, shown before, stays in the shared map
    it.fails('leaves the row blank for KOUT after KIN under a Class C (3-42, #102)', async () => {
        const unit = await bootWith([triangle('TEST CLASS C', BoundaryType.ClassC)]);
        await showApt1(unit);

        expect((await scanToNext(unit))[3]).toBe('           ');
    });

    // 3-42: the preconditions of the second pin below. The search for KAOU (KOUT's position), shown first, offers the
    // airspace and the map refuses it, so the row is blank; KIN is next on the scan
    it('shows KAOU with a blank row, then KIN on the scan (sibling of the second #102 pin) (3-42)', async () => {
        const unit = await bootWith([triangle('TEST CLASS C', BoundaryType.ClassC)], airport('KAOU', 46.85, 12.15),
            kin());

        const rows = await showApt1(unit);
        expect([rows[0], rows[3]]).toEqual([' KAOU      ', '           ']);
        expect((await scanToNext(unit))[0]).toBe(' KIN       ');
    });

    // 3-42: KIN lies under the Class C, whichever airport was shown before
    it.fails('shows CL C for KIN after KAOU (3-42, #102)', async () => {
        const unit = await bootWith([triangle('TEST CLASS C', BoundaryType.ClassC)], airport('KAOU', 46.85, 12.15),
            kin());
        await showApt1(unit);

        expect((await scanToNext(unit))[3]).toBe('CL C       ');
    });
});
