import {describe, expect, it, vi} from 'vitest';
import {bootUnit, settle} from '../../harness/boot';
import {Screen} from '../../harness/render/screen';
import {airport, intersection, ndb, vor} from '../../harness/navdata/builders';
import {savedFlightplan} from '../../harness/storage';
import {standardRoute} from '../../harness/fixtures';

describe('FrontPanel.enterIdent (harness)', () => {
    describe('in an editor', () => {
        it('enters an ident that is the start of a longer one without autocompleting it: KAA stays KAA', async () => {
            // Only KAAA exists, so a search for KAA finds it and fills in the rest, unless the next cell is blank
            const unit = await bootUnit({facilities: [airport('KAAA', 47.0, 8.0)]});
            await unit.panel.selectPage('L', 'FPL 0');
            await unit.panel.cursor('L');

            await unit.panel.enterIdent('L', 'KAA');

            expect(Screen.read().row(1).slice(0, 11)).toBe('  1:KAA    ');
        });

        // The first knob click on an editor starts the edit (Editor.innerRight); while the editor is not in its edit, the
        // outer knob moves the page cursor to the next field (CursorController.outerRight). When the field already shows
        // the first character, enterIdent clicks once anyway, as a pilot would. NAV 4 shows the active waypoint ABC as
        // its VNAV waypoint, and the page has more fields after it.
        it('starts the edit when the editor already shows the first character: AAA over ABC on NAV 4', async () => {
            const {kaaa, abc, kbbb} = standardRoute();
            const unit = await bootUnit({
                facilities: [kaaa, abc, kbbb, vor('AAA', 47.3, 8.3)], position: {lat: kaaa.lat, lon: kaaa.lon},
                storage: savedFlightplan(0, [kaaa, abc, kbbb]),
            });
            await settle(unit);
            await unit.panel.selectPage('L', 'NAV 4');
            await unit.panel.cursor('L');
            await unit.panel.cursorTo('L', 'ABC');
            const at = unit.panel.focused('L'); // the precondition: the VNAV waypoint field, first character A

            await unit.panel.enterIdent('L', 'AAA');

            expect(Screen.read().row(at.row).slice(at.col, at.col + 5)).toBe('AAA  ');
            expect(unit.panel.focused('L')).toEqual({row: at.row, col: at.col, text: 'AAA  '});
        });

        it('enters an ident that fills the editor', async () => {
            const unit = await bootUnit({facilities: [airport('KAAA', 47.0, 8.0)]});
            await unit.panel.selectPage('L', 'FPL 0');
            await unit.panel.cursor('L');

            await unit.panel.enterIdent('L', 'KAAA');

            expect(Screen.read().row(1).slice(0, 11)).toBe('  1:KAAA   ');
        });
    });

    describe('in a waypoint selector', () => {
        it('enters an airport ident on APT 1 with the knobs', async () => {
            // KAAA is the nearest airport and shows without any typing; the test enters KBBB
            const unit = await bootUnit({facilities: [airport('KAAA', 47.0, 8.0), airport('KBBB', 48.0, 9.0)]});
            await unit.panel.selectPage('R', 'APT 1');
            await unit.panel.cursor('R');

            await unit.panel.enterIdent('R', 'KBBB');

            expect(Screen.read().row(0).slice(12)).toBe(' KBBB      ');
        });

        it('enters an ident that is the start of a longer one without autocompleting it: KAA stays KAA', async () => {
            const unit = await bootUnit({facilities: [airport('KAAA', 47.0, 8.0)]});
            await unit.panel.selectPage('R', 'APT 1');
            await unit.panel.cursor('R');

            await unit.panel.enterIdent('R', 'KAA');

            expect(Screen.read().row(0).slice(12)).toBe(' KAA       ');
        });

        // The cursor starts on the first character of each selector. The alphabetically first facility of each type (the
        // one at 47.1, 8.1) shows without any typing, so the screens below, which show the one at 48, 9, prove the typed ident
        const facilities = () => [vor('ABC', 47.1, 8.1), vor('XYZ', 48.0, 9.0), ndb('NDA', 47.1, 8.1), ndb('NDB', 48.0, 9.0),
            intersection('ALPHA', 47.1, 8.1), intersection('BRAVO', 48.0, 9.0)];

        it.each([
            ['VOR  ', 'XYZ', [' XYZ D     ', 'XYZ        ', '          H', '114.30  0°E', "N 48°00.00'"]],
            ['NDB  ', 'NDB', [' NDB       ', 'NDB        ', '           ', 'FREQ  350.0', "N 48°00.00'"]],
            ['INT  ', 'BRAVO', [' BRAVO     ', 'REF:  _____', 'RAD: ___._°', 'DIS:___._NM', "N 48°00.00'"]],
        ])('enters an ident on the %s page', async (page, ident, expected) => {
            const unit = await bootUnit({facilities: facilities()});
            await unit.panel.selectPage('R', page);
            await unit.panel.cursor('R');

            await unit.panel.enterIdent('R', ident);

            // The longitude row is left out because of #230 (the latitude row still shows the typed facility)
            expect(Screen.read().rows('R').slice(0, 5)).toEqual(expected);
        });

        it('enters an ident of the full selector length on the SUP page, where an unknown ident offers to create it', async () => {
            const unit = await bootUnit({facilities: facilities()});
            await unit.panel.selectPage('R', 'SUP  ');
            await unit.panel.cursor('R');

            await unit.panel.enterIdent('R', 'ZZZZZ');

            expect(Screen.read().rows('R')).toEqual([' ZZZZZ     ', '           ', 'CREATE NEW ', 'WPT AT:    ', 'USER POS?  ', 'PRES POS?  ']);
        });

        // The fresh VOR page shows ABC SOUTH (the first of the two in the database), so its first character is an A, the
        // second a B and the third a C already: no click is needed, and none would start a search for ABC. The search
        // result for ABC is the first VOR of that ident in the list order, region K1.
        it('runs the search when the selector already shows the typed characters', async () => {
            const unit = await bootUnit({
                facilities: [
                    vor('ABC', 47.3, 8.3, {region: 'K2', name: 'ABC SOUTH', frequencyMHz: 117.0}),
                    vor('ABC', 47.2, 8.2, {region: 'K1', name: 'ABC NORTH', frequencyMHz: 116.0}),
                ],
            });
            await unit.panel.selectPage('R', 'VOR  ');
            await unit.panel.cursor('R');
            expect(Screen.read().rows('R').slice(0, 2)).toEqual([' ABC D     ', 'ABC SOUTH  ']);

            await unit.panel.enterIdent('R', 'ABC');

            expect(Screen.read().rows('R').slice(0, 2)).toEqual([' ABC D     ', 'ABC NORTH  ']);
        });

        it('throws when the ident is longer than the selector', async () => {
            const unit = await bootUnit({facilities: facilities()});
            await unit.panel.selectPage('R', 'VOR  ');
            await unit.panel.cursor('R');

            await expect(unit.panel.enterIdent('R', 'ABCD')).rejects.toThrow(/"ABCD" is longer than the selector/);
        });
    });

    describe('focused and cursorTo', () => {
        it('reaches the USER POS? field of an unknown airport ident', async () => {
            const unit = await bootUnit({facilities: [airport('KAAA', 47.0, 8.0)]});
            await unit.panel.selectPage('R', 'APT 1');
            await unit.panel.cursor('R');
            await unit.panel.enterIdent('R', 'KZZZ');
            expect(unit.panel.focused('R')).toEqual({row: 0, col: 16, text: 'Z'}) // the cursor stays on the last character typed;

            await unit.panel.cursorTo('R', 'USER POS?');

            expect(unit.panel.focused('R')).toEqual({row: 4, col: 12, text: 'USER POS?'});
        });

        // The cursor of the SUP page without user waypoints has a position between the ident characters and the next
        // field that focuses nothing (the cells of no field are inverted there). The INT page has none any more: the
        // default navdata (fixtures.ts) gives it an entry, and only an empty list stores the 4-character placeholder
        it.each([['SUP  ']])('steps over the cursor position without a field on the %s page', async page => {
            const unit = await bootUnit({facilities: [airport('KAAA', 47.0, 8.0)]});
            await unit.panel.selectPage('R', page);
            await unit.panel.cursor('R');

            await unit.panel.cursorTo('R', 'USER POS?');

            expect(unit.panel.focused('R')).toEqual({row: 4, col: 12, text: 'USER POS?'});
        });

        it('still throws with the screen after the clicks when it steps over a position without a field', async () => {
            const unit = await bootUnit({facilities: [airport('KAAA', 47.0, 8.0)]});
            await unit.panel.selectPage('R', 'SUP  ');
            await unit.panel.cursor('R');

            const outer = vi.spyOn(unit.panel, 'outer');

            // The six clicks cross the position without a field, and then the cap is reached
            await expect(unit.panel.cursorTo('R', 'NO SUCH FIELD', 6)).rejects.toThrow(/no field "NO SUCH FIELD" within 6 clicks/);
            expect(outer).toHaveBeenCalledTimes(6);
        });

        it('throws with the screen when a side shows more than one focused field', async () => {
            const unit = await bootUnit();
            await unit.panel.selectPage('R', 'SUP  ');
            await unit.panel.cursor('R');
            const real = Screen.read();
            // Two inverted runs on the right side: the cells at row 0, column 13 and row 2, column 14
            const stub = Object.create(real) as Screen;
            stub.cell = (r: number, c: number) => (r === 0 && c === 13) || (r === 2 && c === 14) ? {...real.cell(r, c), attr: 'I'} : real.cell(r, c);
            vi.spyOn(unit.panel as any, 'screen').mockReturnValue(stub);
            const outer = vi.spyOn(unit.panel, 'outer');

            await expect(unit.panel.cursorTo('R', 'USER POS?')).rejects.toThrow(/expected one focused field on side R, found 2/);
            expect(outer).not.toHaveBeenCalled();
        });

        it('throws at once when the cursor of that side is off, without turning the pages', async () => {
            const unit = await bootUnit({facilities: [airport('KAAA', 47.0, 8.0)]});
            await unit.panel.selectPage('R', 'APT 1');
            const outer = vi.spyOn(unit.panel, 'outer');

            await expect(unit.panel.cursorTo('R', 'USER POS?')).rejects.toThrow(/the R cursor is off/);
            expect(outer).not.toHaveBeenCalled();
            expect(Screen.read().status().right).toBe('APT 1');
        });

        // The self-test page shows no page name in its left status field, so a blank is not a cursor that is off: the
        // search runs and ends at the cap, on that page
        it('searches on a page with a blank status field, the left one of the self-test page', async () => {
            const unit = await bootUnit({engineRunning: false, magvar: 0});
            await unit.panel.powerOn();
            await vi.advanceTimersByTimeAsync(19_000);
            expect(Screen.read().status().left).toBe('');
            expect(Screen.read().text()).toContain('APPROVE?');

            await expect(unit.panel.cursorTo('L', 'NO SUCH FIELD', 2)).rejects.toThrow(/no field "NO SUCH FIELD" within 2 clicks/);
        });

        it('throws with the screen when the field is not within the clicks', async () => {
            const unit = await bootUnit({facilities: [airport('KAAA', 47.0, 8.0)]});
            await unit.panel.selectPage('R', 'APT 1');
            await unit.panel.cursor('R');
            await unit.panel.enterIdent('R', 'KZZZ');
            const outer = vi.spyOn(unit.panel, 'outer');

            await expect(unit.panel.cursorTo('R', 'NO SUCH FIELD', 3)).rejects.toThrow(/no field "NO SUCH FIELD" within 3 clicks/);
            expect(outer).toHaveBeenCalledTimes(3);
        });
    });
});
