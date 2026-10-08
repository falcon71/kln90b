import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../harness/boot';
import {Screen} from '../../harness/render/screen';
import {KLNFacilityRepository} from '../../../kln90b/data/navdata/KLNFacilityRepository';

/** A key as the sim's keyboard sends it (KLN90BCore), followed by one display tick. Raw on purpose: the key event is the subject. */
async function type(unit: HeadlessUnit, key: string): Promise<void> {
    unit.send('KLN90B_Internal_Key:RIGHT:' + key);
    await vi.advanceTimersByTimeAsync(250);
}

/** The USER POS? page: an empty latitude editor on row 4 and an empty longitude editor on row 5, in the right half */
async function openUserPos(unit: HeadlessUnit): Promise<void> {
    await unit.panel.cursor('R');
    await unit.panel.cursorTo('R', 'USER POS?');
    await unit.panel.ent();
}

describe('keyboard input for editors (characterization, sim-only feature, #25)', () => {
    it('types a latitude into the editor of the USER POS? page', async () => {
        const unit = await bootUnit();
        await openUserPos(unit);
        expect(Screen.read().rows('R')[4]).toBe("_ __°__.__'");
        expect(Screen.read().maskRows('R')[4]).toBe('IIIIIIIIII.');

        for (const key of ['N', '4', '7', '3', '0', '0', '0']) {
            await type(unit, key);
        }

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('R')[4]).toBe("N 47°30.00'");
    });
});

/** The longitudes of the user waypoints in the repository (the region XX holds the user's own waypoints) */
function storedLongitudes(unit: HeadlessUnit): number[] {
    const lons: number[] = [];
    KLNFacilityRepository.getRepository(unit.props.bus).forEach(fac => {
        if (fac.icaoStruct.region === 'XX') lons.push(fac.lon);
    });
    return lons;
}

/** USER POS? with a latitude typed and entered, the cursor on the empty longitude editor (row 5) */
async function onLongitude(): Promise<HeadlessUnit> {
    const unit = await bootUnit();
    await openUserPos(unit);
    for (const key of ['N', '4', '7', '3', '0', '0', '0']) {
        await type(unit, key);
    }
    expect(Screen.read().rows('R')[4]).toBe("N 47°30.00'");
    await unit.panel.ent(); // accepts the latitude and moves on to the longitude
    expect(Screen.read().maskRows('R')[5]).toBe('IIIIIIIIII.');
    return unit;
}

describe('keyboard input of a longitude (3-18, #109)', () => {
    // The sibling of the pin below (3-18, 5-17: the position is entered cell by cell and approved with ENT): a
    // longitude of 100 degrees or more has a 1 in the hundreds place, which the key matches, so it is typed and
    // entered. The typing itself is the sim-only keyboard (#25); the page only says what the entered position looks
    // like.
    it('types a longitude of 100 degrees or more (3-18, sim-only keyboard, #25)', async () => {
        const unit = await onLongitude();
        for (const key of ['E', '1', '2', '0', '3', '0', '0', '0']) {
            await type(unit, key);
        }

        await unit.panel.ent();

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('R')[5]).toBe("E120°30.00'");
        expect(storedLongitudes(unit)).toEqual([120.5]);
    });

    // Half-fixed #25: the hundreds digit of the longitude has the charset [" ", "1"], and a key is matched against the
    // whole entry, so "0" is rejected. A longitude below 100 degrees cannot be typed, and the cursor does not advance.
    // The pin asserts what #109 decides: the stored longitude, 8.5 degrees east, and the cells of the entered row that
    // the zero of the tens (#230) does not touch. 3-18, figure 3-57 shows the entered value with a blank in the
    // hundreds place and its degrees right-aligned.
    it.fails('types a longitude below 100 degrees, with a 0 for the hundreds digit (3-18, #109)', async () => {
        const unit = await onLongitude();
        for (const key of ['E', '0', '0', '8', '3', '0', '0', '0']) {
            await type(unit, key);
        }

        await unit.panel.ent();

        expect(unit.errors).toEqual([]);
        const row = Screen.read().rows('R')[5];
        expect(row.slice(0, 2)).toBe('E ');
        expect(row.slice(3)).toBe("8°30.00'");
        expect(storedLongitudes(unit)).toEqual([8.5]);
    });
});
