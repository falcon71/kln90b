import {describe, expect, it, vi} from 'vitest';
import {FixTypeFlags, LegTurnDirection} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../../../harness/boot';
import {distanceNm, courseDeg, pointFrom} from '../../../harness/flight/geo';
import {airport, intersection, vor} from '../../../harness/navdata/builders';
import {approach, Leg, withProcedures} from '../../../harness/navdata/procedures';
import {SuperNav5} from '../../../harness/render/superNav5';
import {savedFlightplan} from '../../../harness/storage';

// A left arc around ABC from the 270 to the 180 radial through the south-west, then FAFAA and the MAP. A left arc on
// purpose: a right arc is named wrongly after a recalculation (#104).
const abc = vor('ABC', 47.3, 8.3);
const at = (bearing: number, nm: number) => pointFrom({lat: abc.lat, lon: abc.lon}, bearing, nm);
const arcbg = intersection('ARCBG', at(270, 10).lat, at(270, 10).lon);
const arcen = intersection('ARCEN', at(180, 10).lat, at(180, 10).lon);
const fafaa = intersection('FAFAA', 47.1, 7.9);
const mapaa = intersection('MAPAA', 47.0, 8.0);
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
        // The window opens on the active leg. The held aircraft with a ground speed has sequenced past ARCEN to FAFAA, so
        // scan left until the arc's entry shows, with the IAF symbol that SidStar gives it
        for (let i = 0; i < 4 && !SuperNav5.read().directTo!.startsWith('D225J'); i++) {
            await unit.panel.inner('R', -1);
            await vi.advanceTimersByTimeAsync(250);
        }
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
