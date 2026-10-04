import {describe, expect, it} from 'vitest';
import {bootUnit} from '../../harness/boot';
import {Screen} from '../../harness/render/screen';
import {airport, intersection, ndb, vor} from '../../harness/navdata/builders';

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

        // The cursor starts on the first character of each selector. The nearer facility of each type (47.1, 8.1) shows
        // without any typing, so the screens below, which show the one at 48, 9, prove the typed ident
        const facilities = () => [vor('ABC', 47.1, 8.1), vor('XYZ', 48.0, 9.0), ndb('NDA', 47.1, 8.1), ndb('NDB', 48.0, 9.0),
            intersection('ALPHA', 47.1, 8.1), intersection('BRAVO', 48.0, 9.0)];

        it.each([
            ['VOR  ', 'XYZ', [' XYZ D     ', 'XYZ        ', '          H', '114.30  0°E', "N 48°00.00'", "E 09°00.00'"]],
            ['NDB  ', 'NDB', [' NDB       ', 'NDB        ', '           ', 'FREQ  350.0', "N 48°00.00'", "E 09°00.00'"]],
            ['INT  ', 'BRAVO', [' BRAVO     ', 'REF:  _____', 'RAD: ___._°', 'DIS:___._NM', "N 48°00.00'", "E 09°00.00'"]],
        ])('enters an ident on the %s page', async (page, ident, expected) => {
            const unit = await bootUnit({facilities: facilities()});
            await unit.panel.selectPage('R', page);
            await unit.panel.cursor('R');

            await unit.panel.enterIdent('R', ident);

            expect(Screen.read().rows('R')).toEqual(expected);
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

        // The cursor of the SUP and INT pages has a position between the ident characters and the next field that
        // focuses nothing (the cells of no field are inverted there)
        it.each([['SUP  '], ['INT  ']])('steps over the cursor position without a field on the %s page', async page => {
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

            // Four ident characters, the position without a field, and the clicks are used up before USER POS?
            await expect(unit.panel.cursorTo('R', 'NO SUCH FIELD', 6)).rejects.toThrow(/no field "NO SUCH FIELD" within 6 clicks/);
        });

        it('throws with the screen when the field is not within the clicks', async () => {
            const unit = await bootUnit({facilities: [airport('KAAA', 47.0, 8.0)]});
            await unit.panel.selectPage('R', 'APT 1');
            await unit.panel.cursor('R');
            await unit.panel.enterIdent('R', 'KZZZ');

            await expect(unit.panel.cursorTo('R', 'NO SUCH FIELD', 3)).rejects.toThrow(/no field "NO SUCH FIELD" within 3 clicks/);
        });
    });
});
