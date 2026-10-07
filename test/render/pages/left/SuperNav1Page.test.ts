import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../../../harness/boot';
import {airport} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';
import {savedFlightplan} from '../../../harness/storage';
import {pointFrom} from '../../../harness/flight/geo';
import {approachWorld} from '../../../harness/fixtures';
import {MainPage} from '../../../../kln90b/pages/MainPage';
import {SuperNav1Page} from '../../../../kln90b/pages/left/SuperNav1Page';

// The world of Nav1Page.test.ts: KDDD, with KAAA 200 NM west of it on the great circle that leaves KDDD on 270 true
const KDDD = airport('KDDD', 47.0, 9.0);
const KAAA = airport('KAAA', pointFrom(KDDD, 270, 200).lat, pointFrom(KDDD, 270, 200).lon);
const west = (nm: number) => pointFrom(KDDD, 270, nm);

/** NAV 1 on both sides: Super NAV 1 (3-32) */
async function superNav1(unit: HeadlessUnit): Promise<void> {
    await unit.panel.selectPage('L', 'NAV 1');
    await unit.panel.selectPage('R', 'NAV 1');
    await vi.advanceTimersByTimeAsync(1000);
    expect((unit.props.pageManager.getCurrentPage() as MainPage).getOverlayPage()).toBeInstanceOf(SuperNav1Page);
}

/** On the leg KAAA to KDDD, `nm` west of KDDD at `groundspeedKt`, Super NAV 1 shown */
async function onLeg(nm: number, groundspeedKt: number, magvar = 0): Promise<HeadlessUnit> {
    const unit = await bootUnit({
        facilities: [KAAA, KDDD], position: west(nm + 5), magvar, storage: savedFlightplan(0, [KAAA, KDDD]),
    });
    await settle(unit);
    await superNav1(unit);
    await moveAircraft(unit, west(nm), {groundspeedKt, trackTrue: 90});
    await vi.advanceTimersByTimeAsync(1000);
    return unit;
}

const pageRows = () => [0, 1, 2, 3, 4, 5].map(i => Screen.read().row(i));

describe('Super NAV 1 page (characterization)', () => {
    it('spreads the NAV 1 data over the whole screen on an FPL 0 leg', async () => {
        await onLeg(64.8, 145);

        expect(pageRows()).toMatchInlineSnapshot(`
          [
            "      KAAA ›KDDD       ",
            " Ш Ш Ш Ш Ш Ў Ш Ш Ш Ш Ш ",
            "DIS  64.8nm   ETE   :27",
            "GS    145kt   BRG  089°",
            "                       ",
            "                       ",
          ]
        `);
    });
});

describe('Super NAV 1 page', () => {
    // 3-32: Super NAV 1 holds the data of NAV 1. 5-7, figure 5-21: 64.8 NM from the active waypoint at 145 kt it shows
    // DIS 64.8nm, GS 145kt and ETE :27 (26.8 minutes). BRG to KDDD is 088.8 true (worked by hand, see Nav1Page.test.ts).
    it('shows DIS, ETE, GS and BRG as in the manual\'s VNAV example (3-32, 5-7)', async () => {
        await onLeg(64.8, 145);

        const rows = pageRows();
        expect(rows[2]).toBe('DIS  64.8nm   ETE   :27');
        expect(rows[3]).toBe('GS    145kt   BRG  089°');
    });

    // 3-31, 3-32: BRG is magnetic. At a variation of 10 degrees east the 088.8 true bearing of the example reads 079
    it('shows BRG magnetic (3-31, 3-32)', async () => {
        await onLeg(64.8, 145, 10);

        expect(pageRows()[3]).toBe('GS    145kt   BRG  079°');
    });

    // 6-6: the waypoint suffixes (-i for the IAF) show on FPL 0, Super NAV 5 and Super NAV 1, not on NAV 1, whose
    // 11 cells the two idents and the arrow already fill. The approach of approachWorld() loaded, the aircraft 20 NM
    // north of KPRC on the way from ENRAA to the IAF IAFAA.
    it('shows the IAF suffix of the active waypoint, which NAV 1 does not show (6-6)', async () => {
        const w = approachWorld();
        const unit = await bootUnit({facilities: w.facilities, position: w.north(20), storage: savedFlightplan(0, [w.enraa, w.kprc])});
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()?.icaoStruct.ident).toBe('IAFAA'); // Precondition

        await unit.panel.selectPage('L', 'NAV 1');
        expect(Screen.read().rows('L')[0]).toBe('ENRAA›IAFAA');

        await superNav1(unit);
        // The font draws the -i suffix as one glyph on the code point à (SidStar.getWptSuffix)
        expect(Screen.read().row(0).split('›')[1].trimEnd()).toBe('IAFAAà');
    });

    // The setup sibling of the pin: a direct-to KDDD, Super NAV 1 shown, the arrow before KDDD
    it('shows the active waypoint after the arrow on a direct-to (3-32)', async () => {
        const unit = await directToKddd();

        expect(unit.props.memory.navPage.activeWaypoint.isDctNavigation()).toBe(true);
        expect(Screen.read().row(0).split('›')[1].trimEnd()).toBe('KDDD');
    });

    // 3-31 (figure 3-97), 3-32 and figure 5-21: on a direct-to the Direct To symbol stands directly in front of the
    // waypoint (the font's d plus the arrow). The code pads the d to five cells, four cells away from the arrow.
    it.fails('draws the Direct To symbol directly in front of the waypoint (3-31, figure 3-97, 3-32, #NEW-1-5)', async () => {
        await directToKddd();

        expect(Screen.read().row(0).trimEnd()).toMatch(/d›KDDD$/);
    });
});

/** Boots 30 NM west of KDDD, makes a direct-to KDDD from the DIR page, then shows Super NAV 1 */
async function directToKddd(): Promise<HeadlessUnit> {
    const unit = await bootUnit({
        facilities: [KAAA, KDDD], position: west(30), storage: savedFlightplan(0, [KAAA, KDDD]),
    });
    await settle(unit);
    await unit.panel.dct();
    await unit.panel.enterIdent('L', 'KDDD');
    await unit.panel.ent(); // the APT 1 confirmation
    await unit.panel.ent();
    await vi.advanceTimersByTimeAsync(1000);
    await unit.panel.selectPage('L', 'NAV 1'); // NAV 1 is on the right already
    await vi.advanceTimersByTimeAsync(1000);
    expect((unit.props.pageManager.getCurrentPage() as MainPage).getOverlayPage()).toBeInstanceOf(SuperNav1Page);
    return unit;
}
