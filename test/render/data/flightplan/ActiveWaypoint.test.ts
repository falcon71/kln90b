import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {airport, vor} from '../../../harness/navdata/builders';
import {savedFlightplan} from '../../../harness/storage';
import {Screen} from '../../../harness/render/screen';

const kaaa = airport('KAAA', 47.0, 8.0);
const abc = vor('ABC', 47.2, 8.0);
const kbbb = airport('KBBB', 47.4, 8.0);

/** The GPS is valid within about 12 s of boot; until then FPL 0 does not activate */
async function waitForGps(unit: HeadlessUnit): Promise<void> {
    for (let i = 0; i < 120 && !unit.props.sensors.in.gps.isValid(); i++) await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
}

describe('ActiveWaypoint on FPL 0', () => {
    it('flags navigation and drops the FROM waypoint when deleting leaves fewer than two legs (0031c11, d8edd70)', async () => {
        const unit = await bootUnit({
            facilities: [kaaa, kbbb], position: {lat: 47.2, lon: 8.0}, storage: savedFlightplan(0, [kaaa, kbbb]),
        });
        await waitForGps(unit);
        const aw = unit.props.memory.navPage.activeWaypoint;
        expect(aw.getActiveFplIdx()).toBe(1); // Precondition: KBBB is active, KAAA is FROM
        expect(aw.getFromWpt()).not.toBeNull();

        await unit.panel.outer('L', -1); // FPL 0
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 1); // KBBB
        await unit.panel.clr();
        await unit.panel.ent(); // DEL KBBB ?
        await unit.panel.cursor('L');
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.errors).toEqual([]);
        expect(aw.getActiveWpt()).toBeNull();
        expect(aw.getActiveFplIdx()).toBe(-1);
        expect(aw.isDctNavigation()).toBe(false);
        expect(aw.getFromWpt()).toBeNull();
        expect(unit.props.memory.fplPage.flightplans[0].getLegs()).toHaveLength(1);
        // The remaining leg is neither active nor FROM, so its row has no arrow (4-1: FPL 0 with one waypoint is flagged)
        expect(Screen.read().half('L').split('\n')[1]).toBe('  1:KAAA   ');
    });

    // 3-28: a typed Direct To target that is in FPL 0 takes its place in the plan (4-10)
    it('directTo reads the target leg, not the previous active index (43d472b)', async () => {
        const unit = await bootUnit({
            facilities: [kaaa, abc, kbbb], position: {lat: 47.1, lon: 8.0}, storage: savedFlightplan(0, [kaaa, abc, kbbb]),
        });
        await waitForGps(unit);
        const aw = unit.props.memory.navPage.activeWaypoint;
        expect(aw.getActiveFplIdx()).toBe(1); // Precondition: ABC is active

        // The boot right page is SUP without a facility, so the DIR page opens blank (not prefilled with ABC)
        await unit.panel.dct();
        await unit.panel.enterIdent('L', 'KBBB');
        await unit.panel.ent(); // APT 1 confirmation
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.errors).toEqual([]);
        expect(aw.getActiveWpt()?.icaoStruct.ident).toBe('KBBB');
        expect(aw.getActiveFplIdx()).toBe(2);
        expect(aw.isDctNavigation()).toBe(true);
        // ENT errors never reach unit.errors, so also check what the pilot sees: back on NAV 2 and NAV 1, flying to KBBB
        const screen = Screen.read();
        expect(screen.leftName()).toBe('NAV 2');
        expect(screen.rightName()).toBe('NAV 1');
        expect(screen.half('R').split('\n')[0]).toBe('d    ›KBBB ');
    });

    it('keeps a deleted direct-to target as a random direct-to (#67)', async () => {
        // 4-10 to 4-11: a Direct To waypoint is flown on its own, the plan only resumes after it
        const unit = await bootUnit({
            facilities: [kaaa, abc, kbbb], position: {lat: 47.1, lon: 8.0}, storage: savedFlightplan(0, [kaaa, abc, kbbb]),
        });
        await waitForGps(unit);
        const aw = unit.props.memory.navPage.activeWaypoint;

        await unit.panel.outer('L', -1); // FPL 0
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 2); // KBBB
        await unit.panel.dct();
        await unit.panel.ent();
        expect(aw.getActiveFplIdx()).toBe(2); // Precondition: direct to the last leg
        expect(aw.isDctNavigation()).toBe(true);

        await unit.panel.clr();
        await unit.panel.ent(); // DEL KBBB ?
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.errors).toEqual([]);
        expect(aw.getActiveWpt()?.icaoStruct.ident).toBe('KBBB');
        expect(aw.getActiveFplIdx()).toBe(-1);
        expect(aw.isDctNavigation()).toBe(true);
        expect(unit.props.memory.fplPage.flightplans[0].getLegs()).toHaveLength(2);
        // ENT errors never reach unit.errors, so also check the screen: the leg is gone from FPL 0, NAV 1 still flies to KBBB
        const screen = Screen.read();
        expect(screen.half('L').split('\n').slice(1, 4)).toEqual(['  1:KAAA   ', '  2:ABC    ', '  3:       ']);
        expect(screen.half('R').split('\n')[0]).toBe('d    ›KBBB ');
    });
});
