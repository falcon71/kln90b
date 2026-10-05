import {describe, expect, it, vi} from 'vitest';
import {FixTypeFlags, LegTurnDirection} from '@microsoft/msfs-sdk';
import {bootUnit, moveAircraft, settle} from '../../../harness/boot';
import {airport, intersection, vor} from '../../../harness/navdata/builders';
import {approach, Leg, withProcedures} from '../../../harness/navdata/procedures';
import {canvasToAscii} from '../../../harness/render/canvas';
import {Screen} from '../../../harness/render/screen';
import {savedFlightplan} from '../../../harness/storage';
import {LatLon, pointFrom} from '../../../harness/flight/geo';

const RNAV = ApproachType.APPROACH_TYPE_RNAV;

describe('NAV 5 page', () => {
    // The same waypoint twice in a row (#19, #8) gives a flight plan leg without length, and the map projects it to
    // two identical points. Drawing it threw before the map skipped such legs (9f0b7e1).
    it('draws FPL 0 with the same waypoint twice in a row without an error (#8 9f0b7e1, characterization)', async () => {
        const kaaa = airport('KAAA', 46, 7);
        const abc = vor('ABC', 46.05, 7.05);
        const kbbb = airport('KBBB', 46.1, 7.1);
        const unit = await bootUnit({
            facilities: [kaaa, abc, kbbb],
            position: {lat: 46, lon: 7},
            storage: savedFlightplan(0, [kaaa, abc, abc, kbbb]),
        });
        // The FPL activates at the first calculation tick with a GPS fix
        await settle(unit);
        await unit.panel.selectPage('L', 'NAV 5');
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.props.memory.navPage.activeWaypoint.getFutureLegs().map(l => l.wpt.icaoStruct.ident)).toEqual(['ABC', 'ABC', 'KBBB']);
        expect(unit.errors).toEqual([]);
        expect(Screen.read().status().left).toBe('NAV 5');
    });
});

/**
 * A DME arc around ABC from the 180 to the 270 radial (right, clockwise) or from the 270 to the 180 radial (left,
 * counterclockwise), through the south-west quarter. `arcEndNm` places the arc's end fix on its radial (on the circle,
 * 10 NM, by default); the rest of the approach lies on that radial, away from the VOR, unless `rest` places it.
 */
function arcApproach(turn: LegTurnDirection, o: {
    arcEndNm?: number, rest?: { faf: LatLon, map: LatLon, kprc: LatLon }
} = {}) {
    const abc = vor('ABC', 47.3, 8.3);
    const at = (bearing: number, nm: number) => pointFrom(abc, bearing, nm);
    const [from, to] = turn === LegTurnDirection.Right ? [180, 270] : [270, 180];
    const rest = o.rest ?? {faf: at(to, 14), map: at(to, 18), kprc: at(to, 18)};
    const arcbg = intersection('ARCBG', at(from, 10).lat, at(from, 10).lon);
    const arcen = intersection('ARCEN', at(to, o.arcEndNm ?? 10).lat, at(to, o.arcEndNm ?? 10).lon);
    const fafaa = intersection('FAFAA', rest.faf.lat, rest.faf.lon);
    const mapaa = intersection('MAPAA', rest.map.lat, rest.map.lon);
    const kprc = withProcedures(airport('KPRC', rest.kprc.lat, rest.kprc.lon), {
        approaches: [approach({
            type: RNAV, runway: '27',
            transitions: [{
                name: 'ARCBG', legs: [
                    Leg.IF(arcbg, FixTypeFlags.IAF),
                    Leg.AF(arcen, abc, {radiusNm: 10, fromRadial: from, toRadial: to, turn}),
                    Leg.TF(fafaa, FixTypeFlags.FAF),
                ],
            }],
            final: [Leg.TF(mapaa, FixTypeFlags.MAP)],
        })],
    });
    return {abc, at, kprc, facilities: [kprc, abc, arcbg, arcen, fafaa, mapaa]};
}

/**
 * The map draws in blocks of ZOOM_FACTOR (4) canvas pixels, so one character per block keeps every drawn pixel and makes
 * the snapshot readable: a block is lit when any of its pixels is.
 */
function downsampled(ascii: string, block = 4): string {
    const rows = ascii.split('\n');
    const out: string[] = [];
    for (let y = 0; y < rows.length; y += block) {
        let line = '';
        for (let x = 0; x < rows[y].length; x += block) {
            let lit = false;
            for (let dy = 0; dy < block && !lit; dy++) {
                lit = rows[y + dy]?.slice(x, x + block).includes('#') === true;
            }
            line += lit ? '#' : '.';
        }
        out.push(line);
    }
    return out.join('\n') + '\n';
}

describe('NAV 5 page with a DME arc', () => {
    /** Lit pixels of the NAV 5 canvas (396 x 312) in the four quarters around its center, less a margin of 8 px */
    function quarters() {
        const rows = canvasToAscii(document.querySelector('canvas') as HTMLCanvasElement).split('\n');
        const width = rows[0].length, height = rows.length;
        const cx = Math.floor(width / 2), cy = Math.floor(height / 2);
        const count = (x0: number, x1: number, y0: number, y1: number) => {
            let n = 0;
            for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (rows[y][x] === '#') n++;
            return n;
        };
        return {
            ne: count(cx + 8, width, 0, cy - 8), sw: count(0, cx - 8, cy + 8, height),
            nw: count(0, cx - 8, 0, cy - 8), se: count(cx + 8, width, cy + 8, height),
        };
    }

    // Spec: Pilot's Guide 6-17 (the arc is flown, and so drawn, in the direction of the procedure, here through the
    // south-west quarter from the 180 to the 270 radial). 15d9b35 reverses the circle for right-hand arcs; without it
    // the right arc is drawn the long way round, through the other three quarters, and fills the north-east quarter.
    // (Reverting all of 15d9b35 only moved the arrowhead, so it is the SidStar line that the break removes.)
    // The map is north up and 25 NM, centered on the aircraft 0.5 NM east of the VOR; the rest of the plan lies far
    // south-west, so nothing but the arc can reach the north-east quarter. The north-west quarter holds labels.
    it.each([
        ['right', LegTurnDirection.Right],
        ['left', LegTurnDirection.Left],
    ] as const)('draws a %s arc through the south-west quarter only (#18)', async (_name, turn) => {
        const w = arcApproach(turn);
        const unit = await bootUnit({
            facilities: w.facilities, position: w.at(225, 10),
            storage: {...savedFlightplan(0, [w.kprc]), nav5MapOrientation: 0, nav5MapRange: 25},
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('ARCEN');
        // Not exactly onto the VOR: the unit throws there
        await moveAircraft(unit, pointFrom(w.abc, 90, 0.5), {groundspeedKt: 0});
        await unit.panel.selectPage('L', 'NAV 5');
        await vi.advanceTimersByTimeAsync(2000);

        const q = quarters();
        expect(unit.errors).toEqual([]);
        expect(q.ne).toBe(0);
        expect(q.sw).toBeGreaterThan(20);
    });

    // characterization: pins what NAV 5 draws today, and claims nothing about the real unit.
    // e290ea4: the arrow of the active arc ends at the point of the circle closest to the end fix, `arcData.endPoint`.
    // The map used the end fix itself, which is not on the circle when the procedure puts it off the arc, and the
    // GeoCircle threw "the specified point does not lie on this circle". The fix is 3 NM outside the circle on purpose:
    // an offset of 0.3 or 1 NM draws the same pixels with the end fix instead of the end point, so only 3 NM lets the
    // snapshot see the line to the wrong point. The rest of the approach is the one of the procedure tests.
    it('draws the arrow of an arc whose end fix is off the circle to its end point (#17, characterization)', async () => {
        const w = arcApproach(LegTurnDirection.Right, {
            arcEndNm: 13,
            rest: {faf: {lat: 47.1, lon: 7.9}, map: {lat: 47.0, lon: 8.0}, kprc: {lat: 47.0, lon: 8.0}},
        });
        const unit = await bootUnit({
            facilities: w.facilities, position: w.at(225, 10),
            storage: {...savedFlightplan(0, [w.kprc]), nav5MapRange: 10},
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        // Precondition: ARCEN is active, so the map draws the arc with its arrow
        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('ARCEN');
        await unit.panel.selectPage('L', 'NAV 5');
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.errors).toEqual([]);
        expect(unit.consoleErrors).toEqual([]);
        await expect(downsampled(canvasToAscii(document.querySelector('canvas') as HTMLCanvasElement)))
            .toMatchFileSnapshot('./__snapshots__/nav5ArcEndOffCircle.txt');
    });
});
