import {describe, expect, it, vi} from 'vitest';
import {bootUnit, settle} from '../../../harness/boot';
import {airport, vor} from '../../../harness/navdata/builders';
import {savedFlightplan} from '../../../harness/storage';
import {Screen} from '../../../harness/render/screen';

const kaaa = airport('KAAA', 47.0, 8.0);
const abc = vor('ABC', 47.2, 8.0);
const kbbb = airport('KBBB', 47.4, 8.0);

describe('Direct To page', () => {
    it('flies to the second of two identical waypoints when the cursor is on it (#43)', async () => {
        // 4-10 to 4-11: Direct To a waypoint of FPL 0 resumes the plan from the selected occurrence on
        const unit = await bootUnit({
            facilities: [kaaa, abc, kbbb], position: {lat: 47.1, lon: 8.0}, storage: savedFlightplan(0, [kaaa, abc, kbbb, abc]),
        });
        await settle(unit);
        const aw = unit.props.memory.navPage.activeWaypoint;
        expect(aw.getActiveFplIdx()).toBe(1); // Precondition: the first ABC is active

        await unit.panel.outer('L', -1); // FPL 0
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 3); // the second ABC
        await unit.panel.dct();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.errors).toEqual([]);
        expect(aw.getActiveFplIdx()).toBe(3);
        expect(aw.isDctNavigation()).toBe(true);
        expect(aw.getActiveWpt()?.icaoStruct.ident).toBe('ABC');
        const screen = Screen.read();
        // While the FPL 0 cursor is on, the status line shows CRSR and the page names shift by one cell
        expect(screen.row(6).slice(-6)).toBe('NAV 1 ');
        // The arrow marks the direct-to target; the first ABC (row 2) is no longer it
        expect(screen.half('L').split('\n').slice(1, 5).map(r => r.slice(0, 8))).toEqual([
            '  1:KAAA', '  2:ABC ', '  3:KBBB', '› 4:ABC ',
        ]);
    });

    it('stays usable when CLR clears the blank DIR page and the cursor is pressed (#12)', async () => {
        // 3-29: CLR on the DIR page clears the entry
        const unit = await bootUnit();
        await unit.panel.dct();
        await unit.panel.clr();
        await unit.panel.cursor('L');

        expect(unit.errors).toEqual([]);
        const screen = Screen.read();
        expect(screen.leftName()).toBe('DIR  ');
        expect(screen.row(0).slice(0, 11)).toBe('DIRECT TO: ');
    });

    it('returns to NAV 2 when CLR and ENT leave the blank DIR page (sanity check, does not guard #12)', async () => {
        const unit = await bootUnit();
        await unit.panel.dct();
        await unit.panel.clr();
        await unit.panel.ent();

        expect(unit.errors).toEqual([]);
        expect(Screen.read().leftName()).toBe('NAV 2');
        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()).toBeNull();
    });

    it('shows a blank DIR page when there is nothing to suggest (#49)', async () => {
        // 3-27: rule 3 (a waypoint page in view on the right), and the boot SUP page has no facility, so the ident is blank
        const unit = await bootUnit();
        await unit.panel.dct();

        expect(unit.errors).toEqual([]);
        const screen = Screen.read();
        // The cursor is on, so the status line shows CRSR instead of the page name
        expect(screen.row(6).slice(0, 4)).toBe('CRSR');
        expect(screen.half('L').split('\n')).toEqual([
            'DIRECT TO: ', '           ', '           ', '           ', '           ', '           ',
        ]);
    });

    it('keeps the DIR page usable when the right page changes during the confirmation (#81)', async () => {
        // 3-27: DCT from FPL 0 with the cursor on a leg suggests that leg and asks for its confirmation on the right
        const unit = await bootUnit({
            facilities: [kaaa, kbbb], position: {lat: 47.0, lon: 8.0}, storage: savedFlightplan(0, [kaaa, kbbb]),
        });
        await unit.panel.outer('L', -1); // FPL 0
        await unit.panel.cursor('L'); // on KAAA
        await unit.panel.dct();
        // Precondition: the APT 1 confirmation page for KAAA is on the right
        expect(Screen.read().half('R').split('\n')[1]).toBe('KAAA AIRPT ');

        await unit.panel.outer('R', 1);
        await unit.panel.cursor('L');

        expect(unit.errors).toEqual([]);
        const screen = Screen.read();
        expect(screen.leftName()).toBe('DIR  ');
        expect(screen.rightName()).toBe('CTR 1');

        await unit.panel.cursor('L');
        expect(unit.errors).toEqual([]);
        const again = Screen.read();
        // The cursor is on again: CRSR in the status line, the ident field highlighted
        expect(again.row(6).slice(0, 4)).toBe('CRSR');
        expect(again.cell(2, 3).attr).toBe('I');
        expect(again.row(2).slice(0, 11)).toBe('   KAAA    ');
    });
});
