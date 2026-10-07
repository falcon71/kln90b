import {describe, expect, it, vi} from 'vitest';
import {FixTypeFlags} from '@microsoft/msfs-sdk';
import {bootUnit, moveAircraft, settle} from '../../../harness/boot';
import {airport, intersection, vor} from '../../../harness/navdata/builders';
import {approach, Leg, withProcedures} from '../../../harness/navdata/procedures';
import {savedFlightplan} from '../../../harness/storage';
import {Screen} from '../../../harness/render/screen';
import {pointFrom} from '../../../harness/flight/geo';

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

/** The plan KAAA, ABC, KBBB with the aircraft on the first leg (ABC active) and the left and right pages selected */
async function planOnFirstLeg(left: string, right: string) {
    const unit = await bootUnit({
        facilities: [kaaa, abc, kbbb], position: {lat: 47.1, lon: 8.0}, storage: savedFlightplan(0, [kaaa, abc, kbbb]),
    });
    await settle(unit);
    await unit.panel.selectPage('L', left);
    await unit.panel.selectPage('R', right);
    expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('ABC'); // Precondition
    return unit;
}

describe('DIRECT TO page (characterization)', () => {
    it('shows the active waypoint awaiting its confirmation, with its waypoint page on the right (characterization)', async () => {
        const unit = await planOnFirstLeg('NAV 2', 'NAV 1');

        await unit.panel.dct();

        // The longitude row of the right page is left out of the snapshot: it shows a degree below 10 written with a
        // zero (#NEW-1-8)
        const screen = Screen.read();
        expect({
            left: screen.half('L'), leftMask: screen.maskRows('L'), status: screen.status(), right: screen.rows('R').slice(0, 5),
        }).toMatchInlineSnapshot(`
          {
            "left": "DIRECT TO: 
                     
             ABC     
                     
                     
                     ",
            "leftMask": [
              "...........",
              "...........",
              "...IIIII...",
              "...........",
              "...........",
              "...........",
            ],
            "right": [
              "›ABC D     ",
              "ABC        ",
              "          H",
              "114.30  0°E",
              "N 47°12.00'",
            ],
            "status": {
              "left": "CRSR",
              "mode": "enr-leg ent",
              "right": "VOR",
            },
          }
        `);
    });
});

describe('DIRECT TO page (spec)', () => {
    // 3-27, figure 3-87: the Direct To page opens with the cursor over the waypoint identifier; rule 5: with no active
    // waypoint the identifier is blank, so the cursor covers five blank cells
    it('puts the cursor over the blank identifier when there is no active waypoint (3-27)', async () => {
        const unit = await bootUnit();

        await unit.panel.dct();

        expect(unit.panel.focused('L')).toEqual({row: 2, col: 3, text: '     '});
    });

    // 3-27 rule 3 and 3-28 procedure 2 (figures 3-94 to 3-96): with a waypoint page on the right, D-> shows its
    // identifier; that page is already the waypoint page, so one ENT approves it. The right side then shows NAV 1 and the
    // left side returns to the page shown before D->
    it('takes the waypoint page on the right, and one ENT makes it the Direct To waypoint (3-27, 3-28, 3-29)', async () => {
        const unit = await planOnFirstLeg('NAV 2', 'APT 1'); // APT 1 opens on KAAA, the first airport

        await unit.panel.dct();
        expect(Screen.read().rows('L').slice(0, 3)).toEqual(['DIRECT TO: ', '           ', '   KAAA    ']);
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);

        const aw = unit.props.memory.navPage.activeWaypoint;
        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('KAAA');
        expect(aw.isDctNavigation()).toBe(true);
        expect(Screen.read().status().left).toBe('NAV 2');
        expect(Screen.read().status().right).toBe('NAV 1');
    });

    // 3-28 step 7 (and 3-29 step 3): when D-> was pressed with NAV 1 on the left, both sides return to the pages shown
    // before, so the right side keeps its waypoint page instead of NAV 1
    it('returns both sides to their pages when D-> was pressed with NAV 1 on the left (3-28, 3-29)', async () => {
        const unit = await planOnFirstLeg('NAV 1', 'APT 1');

        await unit.panel.dct();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('KAAA');
        expect(Screen.read().status().left).toBe('NAV 1');
        expect(Screen.read().status().right).toBe('APT 1');
    });

    // 3-29 (3.8.5) and 4-7: D->, CLR, ENT cancels Direct To operation and returns to the active flight plan. The aircraft
    // is on the first leg, so the plan resumes with ABC
    it('cancels a Direct To with D->, CLR, ENT and returns to the flight plan (3-29, 4-7)', async () => {
        const unit = await planOnFirstLeg('NAV 2', 'NAV 1');
        await unit.panel.dct();
        await unit.panel.enterIdent('L', 'KBBB');
        await unit.panel.ent(); // KBBB's waypoint page
        await unit.panel.ent(); // approved
        await vi.advanceTimersByTimeAsync(1000);
        const aw = unit.props.memory.navPage.activeWaypoint;
        expect(aw.isDctNavigation()).toBe(true); // Precondition: Direct To KBBB
        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('KBBB');

        await unit.panel.dct();
        await unit.panel.clr();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);

        expect(aw.isDctNavigation()).toBe(false);
        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('ABC');
        expect(aw.getActiveFplIdx()).toBe(1);
        expect(unit.errors).toEqual([]);
    });
});

// 3-27 rule 4: with the Missed Approach Point active and the aircraft on its FROM side, D-> offers the first waypoint
// of the missed approach. RNAV 18 to KPRC with the MAP MAPAA on the airport and the missed approach to MAHAA 5 NM east
// (the world of the MAP tests in NavCalculator.test.ts; approachWorld() has no missed approach)
describe('DIRECT TO page at the missed approach point (3-27)', () => {
    async function pastTheMap() {
        const kprc = airport('KPRC', 47.0, 8.0);
        const mapaa = intersection('MAPAA', 47.0, 8.0);
        const fafPos = pointFrom(mapaa, 0, 5);
        const fafaa = intersection('FAFAA', fafPos.lat, fafPos.lon);
        const mahPos = pointFrom(mapaa, 90, 5);
        const mahaa = intersection('MAHAA', mahPos.lat, mahPos.lon);
        const enrPos = pointFrom(fafPos, 0, 20);
        const enraa = intersection('ENRAA', enrPos.lat, enrPos.lon);
        const apt = withProcedures(kprc, {
            approaches: [approach({
                type: ApproachType.APPROACH_TYPE_RNAV, runway: '18',
                transitions: [{name: 'FAFAA', legs: [Leg.IF(fafaa, FixTypeFlags.IAF)]}],
                final: [Leg.IF(fafaa, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
                missed: [Leg.TF(mahaa, FixTypeFlags.MAHP)],
            })],
        });
        const unit = await bootUnit({
            facilities: [apt, enraa, fafaa, mapaa, mahaa], position: pointFrom(mapaa, 0, 2),
            storage: {...savedFlightplan(0, [enraa, apt]), turnAnticipation: false},
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        await moveAircraft(unit, pointFrom(mapaa, 180, 0.3), {groundspeedKt: 120, trackTrue: 180});
        await unit.panel.selectPage('R', 'NAV 1'); // Not a waypoint page, so rule 3 does not apply
        return unit;
    }

    it('MAPAA active and the aircraft on its FROM side (3-27)', async () => {
        const unit = await pastTheMap();

        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('MAPAA');
        expect(unit.props.memory.navPage.toFrom).toBe(false); // FROM
    });

    it('offers the first waypoint of the missed approach (3-27)', async () => {
        const unit = await pastTheMap();

        await unit.panel.dct();

        expect(Screen.read().rows('L')[2]).toBe('   MAHAA   ');
    });
});

// The KLN 89 trainer (2026-10-07): an identifier that is not in the database, entered with D->, offers the creation of
// a user waypoint. The unit instead answers NO SUCH WPT on the status line and stays on the DIRECT TO page. The creation
// rows are those the SUP page shows for an unknown ident (CreateWaypointMessage)
describe('DIRECT TO page with an unknown identifier', () => {
    /** D->, the identifier QQQQ typed (no facility of that name exists in the world) and ENT */
    async function unknownIdentEntered() {
        const unit = await planOnFirstLeg('NAV 2', 'NAV 1');
        await unit.panel.dct();
        await unit.panel.enterIdent('L', 'QQQQ');
        return unit;
    }

    it('shows the typed unknown ident on the DIRECT TO page (3-27)', async () => {
        const unit = await unknownIdentEntered();

        expect(Screen.read().rows('L').slice(0, 3)).toEqual(['DIRECT TO: ', '           ', '   QQQQ    ']);
        expect(Screen.read().status().right).toBe('NAV 1');
    });

    it.fails('offers to create a user waypoint for an unknown ident (checked in the KLN 89 trainer, 2026-10-07, #NEW-7-5)', async () => {
        const unit = await unknownIdentEntered();

        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(500);

        const screen = Screen.read();
        expect(screen.rows('R').slice(2, 4)).toEqual(['CREATE NEW ', 'WPT AT:    ']);
        expect(screen.status().mode).not.toBe('NO SUCH WPT');
    });
});
