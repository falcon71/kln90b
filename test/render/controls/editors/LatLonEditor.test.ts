import {describe, expect, it, vi} from 'vitest';
import {EventBus, FSComponent, VNode} from '@microsoft/msfs-sdk';
import {LatitudeEditor} from '../../../../kln90b/controls/editors/LatitudeEditor';
import {LongitudeEditor} from '../../../../kln90b/controls/editors/LongitudeEditor';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';

function text(editor: { render(): VNode }): string {
    const host = document.createElement('div');
    FSComponent.render(editor.render(), host);
    return host.textContent ?? '';
}

describe('latitude and longitude editors', () => {
    // 3-18, figure 3-59: the position fields show the hemisphere letter
    it('show the hemisphere of a nonzero value (3-18)', () => {
        const bus = new EventBus();

        expect(text(new LatitudeEditor(bus, 47.5, () => undefined))).toBe('N 47°30.00');
        expect(text(new LatitudeEditor(bus, -47.5, () => undefined))).toBe('S 47°30.00');
        expect(text(new LongitudeEditor(bus, 18.5, () => undefined))).toBe('E 18°30.00');
        expect(text(new LongitudeEditor(bus, -18.5, () => undefined))).toBe('W 18°30.00');
    });
});

describe('latitude and longitude editors without a value (5-17)', () => {
    // 5-17 step 8, figure 5-56: USER POS? shows the latitude as dashes in the cells of a hemisphere, two degree digits,
    // two minute digits and two hundredths, the longitude with three degree digits and no blank after the hemisphere
    it('show dashes in every selectable cell (5-17)', () => {
        const bus = new EventBus();

        expect(text(new LatitudeEditor(bus, null, () => undefined))).toBe('_ __°__.__');
        expect(text(new LongitudeEditor(bus, null, () => undefined))).toBe('____°__.__');
    });
});

const POSITION = {lat: 47.5, lon: 11.25};

/** SET 1 of a unit without a fix (its CONFIRM? sets the position the GPS starts from), cursor on the WPT field */
async function coldSet1(): Promise<HeadlessUnit> {
    const unit = await bootUnit({
        position: POSITION, coldGps: true,
        storage: {fastGpsAcquisition: false, lastLatitude: POSITION.lat, lastLongitude: POSITION.lon},
    });
    expect(unit.props.sensors.in.gps.isValid()).toBe(false);
    await unit.panel.selectPage('L', 'SET 1');
    await unit.panel.cursor('L');
    return unit;
}

/**
 * Opens the editor the cursor is on and selects its cells, moving on with the outer knob. The first click opens the
 * editor with the first cell at its first choice, and the first click on a dashed cell gives its first choice too, so
 * `clicks[i]` clicks select choice `clicks[i] - 1` of cell i (a digit d takes d + 1 clicks).
 */
async function select(unit: HeadlessUnit, clicks: number[]): Promise<void> {
    for (let i = 0; i < clicks.length; i++) {
        if (i > 0) await unit.panel.outer('L', 1);
        if (clicks[i] > 0) await unit.panel.inner('L', clicks[i]);
    }
}

const rowsL = () => Screen.read().rows('L');

/** The characters one cell shows over n clicks of the inner knob, sorted */
async function choices(unit: HeadlessUnit, row: number, col: number, n: number): Promise<string[]> {
    const seen = new Set<string>();
    for (let i = 0; i < n; i++) {
        await unit.panel.inner('L', 1);
        seen.add(rowsL()[row][col]);
    }
    return [...seen].sort();
}

describe('latitude and longitude entered on SET 1 (3-18, 5-17)', () => {
    // 3-18 (the note after step 7): the approximate latitude and longitude can be entered on SET 1 instead of a
    // waypoint; 5-17 step 8 says how: the inner knob selects N or S, then the digits cell by cell, ENT enters the
    // field. S 12°34.56' is -(12 + 34.56 / 60) = -12.576 degrees, which CONFIRM? hands to the GPS.
    it('takes a southern latitude entered with the knobs (3-18, 5-17)', async () => {
        const unit = await coldSet1();
        await unit.panel.outer('L', 1); // the latitude
        await select(unit, [2, 2, 3, 4, 5, 6, 7]); // S, 1 2, 3 4, 5 6
        expect(rowsL()[2]).toBe("S 12°34.56'");
        await unit.panel.ent();
        await unit.panel.cursorTo('L', 'CONFIRM?');
        await unit.panel.ent();

        expect(unit.errors).toEqual([]);
        expect(unit.props.sensors.in.gps.coords.lat).toBeCloseTo(-12.576, 9);
        expect(unit.props.sensors.in.gps.coords.lon).toBeCloseTo(11.25, 9);
    });

    // The same for a western longitude of three digits: W 123°45.67' is -(123 + 45.67 / 60) = -123.7611666... degrees
    it('takes a western longitude of 100 degrees or more entered with the knobs (3-18, 5-17)', async () => {
        const unit = await coldSet1();
        await unit.panel.outer('L', 2); // the longitude
        await select(unit, [2, 2, 3, 4, 5, 6, 7, 8]); // W, 1 2 3, 4 5, 6 7
        expect(rowsL()[3]).toBe("W123°45.67'");
        await unit.panel.ent();
        await unit.panel.cursorTo('L', 'CONFIRM?');
        await unit.panel.ent();

        expect(unit.errors).toEqual([]);
        expect(unit.props.sensors.in.gps.coords.lon).toBeCloseTo(-123.76116666666667, 9);
        expect(unit.props.sensors.in.gps.coords.lat).toBeCloseTo(47.5, 9);
    });

    // 5-17 step 8: the first cell of the latitude offers N and S, that of the longitude E and W
    it('offers N and S for the latitude and E and W for the longitude (5-17)', async () => {
        const unit = await coldSet1();
        await unit.panel.outer('L', 1);
        expect(await choices(unit, 2, 0, 4)).toEqual(['N', 'S']);
        await unit.panel.cursor('L'); // drops the edit
        await unit.panel.cursor('L'); // the cursor comes back on the latitude
        await unit.panel.outer('L', 1);

        expect(await choices(unit, 3, 0, 4)).toEqual(['E', 'W']);
        expect(unit.errors).toEqual([]);
    });

    // The code refuses a latitude whose degree digits are above 90 (LatitudeEditor.convertToValue) with INVALID ENT and
    // the field keeps its value. The route to 91 is only open while the tens of the degrees offer a 9, so this retires
    // with the fix of #303 (the tens offer 0 to 8).
    it('refuses a latitude of 91 degrees with INVALID ENT (characterization)', async () => {
        const unit = await coldSet1();
        await unit.panel.outer('L', 1);
        await select(unit, [1, 10, 2]); // N 9 1
        await unit.panel.ent();
        expect(Screen.read().status().mode).toBe('INVALID ENT');
        await unit.panel.cursor('L');

        expect(unit.errors).toEqual([]);
        expect(rowsL()[2]).toBe("N 47°30.00'");
    });

    // C-1, extended (as for the pins below): a latitude below 90 degrees is a valid entry, so N 89°59.99' is the
    // sibling of the pins below, the largest latitude short of the pole, and is entered
    it('takes the latitude N 89°59.99 (C-1)', async () => {
        const unit = await coldSet1();
        await unit.panel.outer('L', 1);
        await select(unit, [1, 9, 10, 6, 10, 10, 10]); // N 8 9, 5 9, 9 9
        expect(rowsL()[2]).toBe("N 89°59.99'");
        await unit.panel.ent();
        await unit.panel.cursorTo('L', 'CONFIRM?');
        await unit.panel.ent();

        expect(unit.errors).toEqual([]);
        expect(unit.props.sensors.in.gps.coords.lat).toBeCloseTo(89 + 59.99 / 60, 9);
    });

    // C-1, extended: 90 degrees and 30 minutes are more than 90 degrees, which no latitude has. LatitudeEditor
    // .convertToValue checks the degree digits alone (degrees > 90), so N 90°30.00' is entered as 90.5 degrees. If the
    // fix takes the 9 out of the tens (the pin below), this entry can no longer be made and this pin retires.
    it.fails('refuses the latitude N 90°30.00 with INVALID ENT (C-1, #303)', async () => {
        const unit = await coldSet1();
        await unit.panel.outer('L', 1);
        await select(unit, [1, 10, 1, 4]); // N 9 0, 3, the rest blank
        expect(rowsL()[2]).toBe("N 90°3_.__'");
        await unit.panel.ent();

        expect(unit.errors).toEqual([]);
        expect(Screen.read().status().mode).toBe('INVALID ENT');
    });

    // Checked in the KLN 89 trainer, 2026-10-08 (T9): the tens of the latitude degrees offer 0 to 8, so no latitude of
    // 90 degrees or more can be entered at all. The code offers 0 to 9.
    it.fails('offers 0 to 8 in the tens of the latitude degrees, no 9 (checked in ' +
        'the KLN 89 trainer, 2026-10-08, #303)', async () => {
        const unit = await coldSet1();
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 1); // opens the edit on the hemisphere
        await unit.panel.outer('L', 1); // the tens

        const seen = await choices(unit, 2, 2, 10);

        expect(unit.errors).toEqual([]);
        expect(seen).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8']);
    });

    // Sibling of the pin above (checked in the KLN 89 trainer, 2026-10-08, T9): the tens start at 0 and count up by
    // one, the ninth click gives 8
    it('starts the tens of the latitude degrees at 0 and counts up by one ' +
        '(checked in the KLN 89 trainer, 2026-10-08)', async () => {
        const unit = await coldSet1();
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 1); // opens the edit on the hemisphere
        await unit.panel.outer('L', 1); // the tens
        await unit.panel.inner('L', 1);
        expect(rowsL()[2][2]).toBe('0');
        await unit.panel.inner('L', 1);
        expect(rowsL()[2][2]).toBe('1');

        await unit.panel.inner('L', 7);

        expect(unit.errors).toEqual([]);
        expect(rowsL()[2][2]).toBe('8');
    });

    // C-1, extended (as for the pin below): the longitude of 179°59.99' is a valid entry and is entered
    it('takes the longitude E179°59.99 (C-1)', async () => {
        const unit = await coldSet1();
        await unit.panel.outer('L', 2);
        await select(unit, [1, 2, 8, 10, 6, 10, 10, 10]); // E 1 7 9, 5 9, 9 9
        expect(rowsL()[3]).toBe("E179°59.99'");
        await unit.panel.ent();
        await unit.panel.cursorTo('L', 'CONFIRM?');
        await unit.panel.ent();

        expect(unit.errors).toEqual([]);
        expect(unit.props.sensors.in.gps.coords.lon).toBeCloseTo(179 + 59.99 / 60, 9);
    });

    // C-1, extended: the same for the longitude, which LongitudeEditor.convertToValue checks with degrees > 180 alone.
    // E 180°00.00' has no test: the KLN 89 trainer's longitude block stops at 179 (00 to 17 and a units digit), and
    // that layout exists only on the 89.
    it.fails('refuses the longitude E180°30.00 with INVALID ENT (C-1, #303)', async () => {
        const unit = await coldSet1();
        await unit.panel.outer('L', 2);
        await select(unit, [1, 2, 9, 1, 4]); // E 1 8 0, 3
        expect(rowsL()[3]).toBe("E180°3_.__'");
        await unit.panel.ent();

        expect(unit.errors).toEqual([]);
        expect(Screen.read().status().mode).toBe('INVALID ENT');
    });
});

describe('longitude editor, the hundreds digit', () => {
    // 3-18, figures 3-57 and 5-58: a longitude below 100 degrees shows a blank in the hundreds place once entered
    it('shows a blank hundreds digit after a longitude below 100 degrees is entered (3-18, 5-17)', async () => {
        const unit = await coldSet1();
        await unit.panel.outer('L', 2);
        await select(unit, [1, 1, 2, 3]); // E, the first choice of the hundreds, 1 2
        await unit.panel.ent();
        await unit.panel.cursor('L');

        expect(unit.errors).toEqual([]);
        expect(rowsL()[3]).toBe("E 12°00.00'");
    });

    // Checked in the KLN 89 trainer, 2026-10-08 (T8, also recorded in #230): while a longitude below 100 degrees is
    // being selected, the open edit field shows the hundreds place as a 0 (E008°); only the entered value shows a
    // blank. NumberEditorField.createWithBlankMax(1) offers a blank and a 1, so the open field shows a blank (E 08°).
    it.fails('shows a 0 in the hundreds place while a longitude below 100 degrees ' +
        'is selected (checked in the KLN 89 trainer, 2026-10-08, #304)', async () => {
        const unit = await coldSet1();
        await unit.panel.outer('L', 2);
        await select(unit, [1, 1, 1, 9]); // E, the first choice of the hundreds, 0, 8

        expect(unit.errors).toEqual([]);
        expect(rowsL()[3]).toBe("E008°__.__'");
    });

    // The sibling of the pin: the hundreds place offers two choices, one of them a 1
    it('offers two choices in the hundreds place, one of them a 1 (characterization)', async () => {
        const unit = await coldSet1();
        await unit.panel.outer('L', 2);
        await select(unit, [1, 0]); // E, then the hundreds

        const seen = await choices(unit, 3, 1, 4);

        expect(unit.errors).toEqual([]);
        expect(seen).toHaveLength(2);
        expect(seen).toContain('1');
    });
});

describe('latitude editor just below a whole degree (#99)', () => {
    // A position a few nanodegrees below 47° is 47°00.00' to the hundredth of a minute. The editors split the value
    // like LatitudeDisplay (#99): the degrees are floored, the minutes rounded to 60.00, and the 6 is outside the
    // choices 0 to 5 of the minutes' tens, so the cell shows nothing and the row is one cell short (N 46°0.00').
    it.fails('shows N 47°00.00 for a position just below 47 degrees on SET 1 (3-18, #99)', async () => {
        const unit = await bootUnit({position: {lat: 46.99999999716931, lon: 11.25}});
        await unit.panel.selectPage('L', 'SET 1');

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L')[2]).toBe("N 47°00.00'");
    });

    // The sibling: the same boot a whole minute below 47 degrees shows the position
    it('shows N 46°59.00 for a position a minute below 47 degrees on SET 1 (3-18)', async () => {
        const unit = await bootUnit({position: {lat: 46 + 59 / 60, lon: 11.25}});
        await unit.panel.selectPage('L', 'SET 1');

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L')[2]).toBe("N 46°59.00'");
    });
});

describe('latitude and longitude editors at exactly 0 degrees ' +
    '(checked in the KLN 89 trainer, 2026-10-08, #308)', () => {
    /**
     * Enters the cells of a latitude (row 2) or longitude (row 3) with the knobs on SET 1, confirms the position, and
     * leaves SET 1 and comes back, so that the page builds its editors again from the position the unit keeps. The
     * hemisphere letter of the shown value is the editors' own conversion of that number.
     */
    async function shownAfterConfirm(row: 2 | 3, clicks: number[]): Promise<string> {
        const unit = await coldSet1();
        await unit.panel.outer('L', row - 1);
        await select(unit, clicks);
        await unit.panel.ent();
        await unit.panel.cursorTo('L', 'CONFIRM?');
        await unit.panel.ent();
        await unit.panel.selectPage('L', 'SET 2');
        await unit.panel.selectPage('L', 'SET 1');
        expect(unit.errors).toEqual([]);
        return rowsL()[row];
    }

    // Checked in the KLN 89 trainer, 2026-10-08 (T35): after entering S 0°00.00' or W 0°00.00' the unit shows N
    // 0°00.00' and E 0°00.00' (the trainer's zero is blank-padded, which is #230; only the hemisphere is asserted). The
    // editors choose S and W for a value that is not above 0 (LatitudeEditor and LongitudeEditor.convertFromValue).
    it.fails('shows a latitude of exactly 0 as N (checked in the KLN 89 trainer, 2026-10-08, #308)', async () => {
        const shown = await shownAfterConfirm(2, [1, 1, 1, 1, 1, 1, 1]); // N 00°00.00

        expect(shown[0]).toBe('N');
    });

    it.fails('shows a longitude of exactly 0 as E (checked in the KLN 89 trainer, 2026-10-08, #308)', async () => {
        const shown = await shownAfterConfirm(3, [1, 1, 1, 1, 1, 1, 1, 1]); // E 000°00.00

        expect(shown[0]).toBe('E');
    });

    // Siblings of the pins (3-18, figure 3-59: the position fields show the hemisphere of the value): the same entry
    // route with a small nonzero value, which keeps the hemisphere it was given
    it('shows a latitude of S 0°30.00 as S (3-18)', async () => {
        const shown = await shownAfterConfirm(2, [2, 1, 1, 4, 1, 1, 1]); // S 00°30.00

        expect(shown[0]).toBe('S');
        expect(shown.slice(3)).toBe("0°30.00'");
    });

    it('shows a longitude of W 0°30.00 as W (3-18)', async () => {
        const shown = await shownAfterConfirm(3, [2, 1, 1, 1, 4, 1, 1, 1]); // W 000°30.00

        expect(shown[0]).toBe('W');
        expect(shown.slice(3)).toBe("0°30.00'");
    });
});

describe('longitude editor and the sim keyboard (characterization, sim-only feature, #25)', () => {
    /** A key as the PC keyboard sends it to the unit (PageContainer publishes the key code; KLN90BCore maps it) */
    const key = async (unit: HeadlessUnit, keyCode: number) => {
        unit.props.bus.getPublisher<any>().pub('keyboardevent', {side: 'LEFT', keyCode});
        await vi.advanceTimersByTimeAsync(250);
    };

    // The lead of Session 9a (a typed blank entered E 10°30.00' on SUP): only the harness's raw key event can carry a
    // blank. The PC keyboard's space bar (key code 32) is not passed on, so #109 stands for the keyboard: the hundreds
    // place takes neither a 0 nor a blank, and a longitude below 100 degrees cannot be typed.
    it('does not pass the space bar on, so the hundreds place stays open', async () => {
        const unit = await coldSet1();
        await unit.panel.outer('L', 2);
        await key(unit, 69); // E
        expect(rowsL()[3]).toBe("E___°__.__'");

        await key(unit, 32); // the space bar
        await key(unit, 49); // 1: the hundreds place takes it, so the space bar moved nothing on

        expect(unit.errors).toEqual([]);
        expect(rowsL()[3]).toBe("E1__°__.__'");
    });
});
