import {describe, expect, it, vi} from 'vitest';
import {FixTypeFlags, LegTurnDirection} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../../../harness/boot';
import {distanceNm, courseDeg, pointFrom} from '../../../harness/flight/geo';
import {airport, intersection, vor} from '../../../harness/navdata/builders';
import {approach, Leg, withProcedures} from '../../../harness/navdata/procedures';
import {SuperNav5} from '../../../harness/render/superNav5';
import {savedFlightplan} from '../../../harness/storage';
import {standardRoute} from '../../../harness/fixtures';

// A left arc around ABC from the 270 to the 180 radial through the south-west, then FAFAA and the MAP. A left arc on
// purpose: a right arc is named wrongly after a recalculation (#104).
const abc = vor('ABC', 47.3, 8.3);
const at = (bearing: number, nm: number) => pointFrom({lat: abc.lat, lon: abc.lon}, bearing, nm);
const arcbg = intersection('ARCBG', at(270, 10).lat, at(270, 10).lon);
const arcen = intersection('ARCEN', at(180, 10).lat, at(180, 10).lon);
const fafaa = intersection('FAFAA', 47.1, 8.7);
const mapaa = intersection('MAPAA', 47.0, 8.7);
const kprc = withProcedures(airport('KPRC', 47.0, 8.0), {
    approaches: [approach({
        type: ApproachType.APPROACH_TYPE_RNAV, runway: '27',
        transitions: [{
            name: 'ARCBG', legs: [
                Leg.IF(arcbg, FixTypeFlags.IAF),
                Leg.AF(arcen, abc, {radiusNm: 10, fromRadial: 270, toRadial: 180, turn: LegTurnDirection.Left}),
                Leg.TF(fafaa, FixTypeFlags.FAF),
            ],
        }],
        final: [Leg.TF(mapaa, FixTypeFlags.MAP)],
    })],
});

const fpl0Idents = (unit: HeadlessUnit) => unit.props.memory.fplPage.flightplans[0].getLegs().map(l => l.wpt.icaoStruct.ident);

describe('Super NAV 5 direct-to window on a DME arc entry', () => {
    // Spec: Pilot's Guide 6-17 (on Super NAV 5, CLR on the arc's entry waypoint shows MOVE ?, and ENT moves the
    // entry to the intercept of the present track with the arc). 1ef2a35: ENT leaves the MOVE ? state. Without that the
    // window keeps showing MOVE ? after the new entry is calculated.
    it('leaves MOVE ? after ENT and shows the new entry (1ef2a35)', async () => {
        const unit = await bootUnit({
            facilities: [kprc, abc, arcbg, arcen, fafaa, mapaa], position: at(225, 10), storage: savedFlightplan(0, [kprc]),
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        expect(fpl0Idents(unit)).toEqual(['D225J', 'ARCEN', 'FAFAA', 'MAPAA', 'KPRC']);

        // 15 NM out on the 200 radial, flying 010: the track meets the 10 NM circle in front of the aircraft, inside the
        // arc. A track of 330 would miss the circle and give NO INTRCPT, which hides the subject.
        const start = at(200, 15);
        await moveAircraft(unit, start, {groundspeedKt: 0});
        await moveAircraft(unit, pointFrom(start, 10, 0.05), {groundspeedKt: 120});

        await unit.panel.selectPage('R', 'NAV 4'); // the right side first: its shorter way passes NAV 5
        await unit.panel.selectPage('L', 'NAV 5');
        await unit.panel.inner('R', 1); // NAV 5 on both sides: Super NAV 5
        await unit.panel.scan();
        await vi.advanceTimersByTimeAsync(250);
        // The window opens on the active leg, the arc: its end ARCEN shows. The left arc ends heading east, and FAFAA
        // lies east of ARCEN (a turn of a few degrees, so the anticipation does not skip ARCEN; with FAFAA west of it the
        // turn is near 180 degrees and ARCEN is sequenced at once, #76). One step left shows the arc's entry, with the IAF
        // symbol that SidStar gives it.
        expect(SuperNav5.read().directTo).toBe('ARCEN ');
        await unit.panel.inner('R', -1);
        await vi.advanceTimersByTimeAsync(250);
        expect(SuperNav5.read().directTo).toBe('D225Jà');

        await unit.panel.clr();
        await vi.advanceTimersByTimeAsync(250);
        expect(SuperNav5.read().directTo).toBe('MOVE ?');

        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(500);
        // The track from the aircraft meets the circle on the 205.05 radial (stepped along the track on the sphere until
        // the distance to ABC reached 10 NM), so the entry is named D205J and sits there
        expect(SuperNav5.read().directTo).toBe('D205Jà');
        const [entry] = unit.props.memory.fplPage.flightplans[0].getLegs();
        expect(entry.wpt.icaoStruct.ident).toBe('D205J');
        expect(courseDeg(abc, entry.wpt)).toBeCloseTo(205.05, 1);
        expect(distanceNm(abc, entry.wpt)).toBeCloseTo(10, 2);
        expect(fpl0Idents(unit)).toEqual(['D205J', 'ARCEN', 'FAFAA', 'MAPAA', 'KPRC']);
        expect(unit.errors).toEqual([]);
    });
});

// The standard route of SuperNav5Page.test.ts: KAAA, ABC, KBBB in FPL 0, the aircraft at KAAA, ABC active; Super NAV 5
// with the right inner knob pulled out
async function scanOnStandardRoute() {
    const w = standardRoute();
    const unit = await bootUnit({
        facilities: [w.kaaa, w.abc, w.kbbb], position: {lat: w.kaaa.lat, lon: w.kaaa.lon},
        storage: savedFlightplan(0, [w.kaaa, w.abc, w.kbbb]),
    });
    await settle(unit);
    await unit.panel.selectPage('R', 'NAV 4');
    await unit.panel.selectPage('L', 'NAV 5');
    await unit.panel.inner('R', 1);
    await unit.panel.scan();
    await vi.advanceTimersByTimeAsync(250);
    return unit;
}

describe('Super NAV 5 direct-to window', () => {
    // 3-38: the window starts on the active waypoint each time the knob is pulled out: scanned to KBBB, pushed in and
    // pulled out again, it shows ABC
    it('starts on the active waypoint again after the knob is pushed in and pulled out (3-38)', async () => {
        const unit = await scanOnStandardRoute();
        await unit.panel.inner('R', 1);
        expect(SuperNav5.read().directTo).toBe('KBBB  ');
        await unit.panel.scan();
        await unit.panel.scan();
        await vi.advanceTimersByTimeAsync(250);

        expect(SuperNav5.read().directTo).toBe('ABC   ');
    });

    // 6-17: CLR in the window offers MOVE ? only for the entry of a DME arc; on another waypoint the window keeps the
    // waypoint
    it('shows no MOVE ? for CLR on a waypoint that is not an arc entry (6-17)', async () => {
        const unit = await scanOnStandardRoute();
        await unit.panel.clr();
        await vi.advanceTimersByTimeAsync(250);

        expect(SuperNav5.read().directTo).toBe('ABC   ');
    });
});

describe('Super NAV 5 direct-to window (characterization)', () => {
    // An empty FPL 0 (a fresh unit) gives a window of blanks that the knob does not change; the guide does not show
    // the case
    it('shows a blank window with an empty FPL 0 (characterization)', async () => {
        const unit = await bootUnit();
        await settle(unit);
        await unit.panel.selectPage('R', 'NAV 4');
        await unit.panel.selectPage('L', 'NAV 5');
        await unit.panel.inner('R', 1);
        await unit.panel.scan();
        await vi.advanceTimersByTimeAsync(250);

        expect(SuperNav5.read().directTo).toBe('      ');
        await unit.panel.inner('R', 1);
        expect(SuperNav5.read().directTo).toBe('      ');
        expect(unit.errors).toEqual([]);
    });
});
