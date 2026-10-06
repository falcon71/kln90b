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

        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 3); // the second ABC, by count: the first one has the same ident
        await unit.panel.dct();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.errors).toEqual([]);
        expect(aw.getActiveFplIdx()).toBe(3);
        expect(aw.isDctNavigation()).toBe(true);
        expect(aw.getActiveWpt()?.icaoStruct.ident).toBe('ABC');
        const screen = Screen.read();
        // The left cursor is deliberately not asserted: figure 4-42 (4-11) shows it off after the approval, and the unit
        // leaves it on (#82, pinned in DirectToObs.test.ts)
        expect(screen.status().right).toBe('NAV 1');
        // The arrow marks the direct-to target; the first ABC (row 2) is no longer it
        expect(screen.rows('L').slice(1, 5).map(r => r.slice(0, 8))).toEqual([
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
        expect(screen.status().left).toBe('DIR');
        expect(screen.rows('L')[0]).toBe('DIRECT TO: ');
    });

    it('returns to NAV 2 when CLR and ENT leave the blank DIR page (sanity check, does not guard #12)', async () => {
        const unit = await bootUnit();
        await unit.panel.dct();
        await unit.panel.clr();
        await unit.panel.ent();

        expect(unit.errors).toEqual([]);
        expect(Screen.read().status().left).toBe('NAV 2');
        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()).toBeNull();
    });

    it('shows a blank DIR page when there is nothing to suggest (#49)', async () => {
        // 3-27: rule 3 (a waypoint page in view on the right), and the boot SUP page has no facility, so the ident is blank
        const unit = await bootUnit();
        await unit.panel.dct();

        expect(unit.errors).toEqual([]);
        const screen = Screen.read();
        // The cursor is on, so the status line shows CRSR instead of the page name
        expect(screen.status().left).toBe('CRSR');
        expect(screen.rows('L')).toEqual([
            'DIRECT TO: ', '           ', '           ', '           ', '           ', '           ',
        ]);
    });

    it('keeps the DIR page usable when the right page changes during the confirmation (#81)', async () => {
        // 3-27: DCT from FPL 0 with the cursor on a leg suggests that leg and asks for its confirmation on the right
        const unit = await bootUnit({
            facilities: [kaaa, kbbb], position: {lat: 47.0, lon: 8.0}, storage: savedFlightplan(0, [kaaa, kbbb]),
        });
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L'); // on KAAA
        await unit.panel.dct();
        // Precondition: the APT 1 confirmation page for KAAA is on the right
        expect(Screen.read().rows('R')[1]).toBe('KAAA AIRPT ');

        await unit.panel.outer('R', 1); // raw: the knob that changes the right page is the subject (#81)
        await unit.panel.cursor('L');

        expect(unit.errors).toEqual([]);
        const screen = Screen.read();
        expect(screen.status().left).toBe('DIR');
        expect(screen.status().right).toBe('CTR 1');

        await unit.panel.cursor('L');
        expect(unit.errors).toEqual([]);
        const again = Screen.read();
        // The cursor is on again: CRSR in the status line, the ident field highlighted
        expect(again.status().left).toBe('CRSR');
        expect(again.cell(2, 3).attr).toBe('I');
        expect(again.rows('L')[2]).toBe('   KAAA    ');
    });

    // The plan KAAA, ABC, KBBB with the aircraft on the first leg: ABC is active. The boot has no stored last active
    // waypoint, so the right side shows the empty SUP page, as in the reproduction of #119
    async function bootWithAbcActive() {
        const unit = await bootUnit({
            facilities: [kaaa, abc, kbbb], position: {lat: 47.1, lon: 8.0}, storage: savedFlightplan(0, [kaaa, abc, kbbb]),
        });
        await settle(unit);
        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('ABC');
        return unit;
    }

    // 3-27 rule 4: with no rule 1 to 3 candidate, the DIRECT TO page shows the active waypoint. NAV 1 is not a waypoint
    // page, so rule 3 does not apply; this is the sibling of the pin below and holds the setup (#119)
    it('prefills the active waypoint on the DIRECT TO page when NAV 1 is on the right (3-27 rule 4, sibling of #119)', async () => {
        const unit = await bootWithAbcActive();
        await unit.panel.selectPage('R', 'NAV 1');

        await unit.panel.dct();

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L')[0]).toBe('DIRECT TO: ');
        expect(Screen.read().rows('L')[2]).toBe('   ABC     ');
    });

    // 3-27: the sibling of the pin below; its setup holds and the DIRECT TO page opens
    it('opens the DIRECT TO page with ABC active and the empty SUP page on the right, as after power-up (the setup of #119)', async () => {
        const unit = await bootWithAbcActive();
        expect(Screen.read().status().right).toBe('SUP');

        await unit.panel.dct();

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L')[0]).toBe('DIRECT TO: ');
    });

    // 3-27 rule 4, "checked in the KLN 89 trainer: the active waypoint is prefilled after power-up from a waypoint page
    // and from NAV 1". Rule 3 applies only when a waypoint is shown on the page: the empty SUP page of the boot has none,
    // but the unit returns its null and never reaches rule 4 (#119)
    it.fails('prefills the active waypoint on the DIRECT TO page when the right page is the empty SUP page of the boot (#119)', async () => {
        const unit = await bootWithAbcActive();

        await unit.panel.dct();

        expect(Screen.read().rows('L')[2]).toBe('   ABC     ');
    });
});
