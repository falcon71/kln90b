import {describe, expect, it} from 'vitest';
import {Flight} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';
import {airport} from '../../harness/navdata/builders';
import {savedFlightplan} from '../../harness/storage';
import {courseDeg, crossTrackNm, distanceNm, finalCourseDeg, LatLon, pointFrom} from '../../harness/flight/geo';
import {scriptedPath} from '../../harness/flight/pilots';

const dms = (d: number, m: number, s: number) => d + m / 60 + s / 3600;
const DEG = Math.PI / 180;

/**
 * The active waypoint once per second for RECORDED_S after the closest approach to EDSZ, with the geometry the
 * sequencing rules read: the distances to EDSZ and EDTW, the distances off the leg into EDSZ, off the leg from EDSZ to
 * EDTW and off the leg from EDTW to EDNN (whole great circles), the distance past EDSZ's abeam line along the leg into
 * EDSZ, and the distance along the leg from EDSZ to EDTW (negative behind EDSZ)
 */
const afterEdsz: {
    ident: string | null; distEdsz: number; distEdtw: number; offInbound: number; pastAbeam: number; offEdtwLeg: number;
    alongEdtwLeg: number; offEdnnLeg: number
}[] = [];
const RECORDED_S = 240;
/** The first minute after the closest approach, the stretch of the report */
const FIRST_MINUTE = 60;
/** A calculation tick of flight at 120 kt and a display tick of rounding */
const TOLERANCE_NM = 120 / 3600 + 0.02;

/**
 * #375, reported from the sim: the flight plan of the report (its .pln; EDTZ and EDPT approximate, they are not on the
 * route that matters). The video of the report shows this simulator (v2.2), not a real KLN 90B. In it (45:20 to 45:46)
 * the pilot flies VFR towards EDNN, not the EDSZ - EDTW leg: the screen shows EDSZ at 1.2 NM bearing 036°, 0.5 NM 047°,
 * 0.2 NM 027° and 358°, so the aircraft turned right from about 030° to about 080° and passed 0.2 NM south of EDSZ. The
 * unit then showed EDSZ - EDTW (13.2 NM) and two seconds later EDTW - EDNN. The track below is rebuilt from those
 * readings.
 *
 * Since #375 an anticipated turn is sequenced on the leg where the aircraft passes the bisector of the turn, once the turn
 * has started (checked in the KLN 89 trainer, 2026-10-20, docs/kln89-trainer-record.md). On this track the aircraft
 * never passes the bisector of the 36° left turn at EDSZ. It is sequenced instead by the rule off the leg (#157, the same
 * trainer checks): once the aircraft is more than 4.0 NM from the leg into EDSZ, the next leg's segment, whose nearest
 * point is EDSZ itself, is as close as the active one at EDSZ's abeam line, about 4.2 NM from EDSZ and two minutes after
 * passing it. A minute later the same rule takes EDNN, at the inside bisector of the turn at EDTW, with EDTW 17 NM away:
 * the aircraft, bound for EDNN, is then as close to the leg from EDTW to EDNN as to EDSZ. That is the trainer's rule off
 * the leg (it sequenced at the inside bisector 11 NM from the waypoint), not the bug of the report, which took EDNN two
 * seconds after EDTW because the turn at EDSZ was still on the stack. That mechanism, a previous turn still on the stack
 * while the next waypoint is active, is held by the corner-cutting test in bisectorSequencing.test.ts and the 2.0 NM leg
 * test in turnLead.test.ts.
 *
 * The first test flies and records and the others only judge what was recorded, so a broken flight fails the first
 * and cannot be mistaken for the bug.
 */
describe('a waypoint passed while flying away from the next one (#375)', () => {
    it('flies the track of the report past EDSZ and away from EDTW', async () => {
        const edtz = airport('EDTZ', 47.6814, 9.1372);
        const edsz = airport('EDSZ', dms(48, 11, 11.4), dms(8, 43, 16.2));
        const edtw = airport('EDTW', dms(48, 16, 45.0), dms(8, 25, 42.0));
        const ednn = airport('EDNN', dms(48, 23, 8.92), dms(9, 4, 35.78));
        const edst = airport('EDST', dms(48, 37, 56.01), dms(9, 25, 34.3));
        const edtn = airport('EDTN', dms(48, 36, 48.99), dms(9, 28, 42.0));
        const edpm = airport('EDPM', dms(48, 40, 41.4), dms(9, 50, 36.6));
        const edpt = airport('EDPT', 48.6203, 10.0603);
        const plan = [edtz, edsz, edtw, ednn, edst, edtn, edpm, edpt];
        const world = new World({magvar: 0}).add(...plan);
        /** The point x NM east and y NM north of EDSZ */
        const rel = (x: number, y: number): LatLon => pointFrom(edsz, (Math.atan2(x, y) * 180 / Math.PI + 360) % 360, Math.hypot(x, y));

        // 5.8 NM south-southwest of EDSZ the first leg is the closest, so EDSZ is active, as in the video of the report
        const start = rel(-3, -5);
        const flight = await Flight.start({
            world, storage: savedFlightplan(0, plan),
            pilot: scriptedPath([rel(-0.7, -0.97), rel(-0.37, -0.34), rel(0, -0.2), rel(1.5, -0.2), ednn]),
            aircraft: {lat: start.lat, lon: start.lon, altitudeFt: 3900, groundspeedKt: 120, trackTrue: 30},
        });
        await flight.flyUntilActive('EDSZ', {timeout: 5});

        // The closest approach to EDSZ: the first second in which the distance grows
        let closest = distanceNm(flight.aircraft, edsz);
        for (let s = 0; ; s++) {
            expect(s, 'the closest approach to EDSZ').toBeLessThan(5 * 60);
            await flight.fly(1);
            const d = distanceNm(flight.aircraft, edsz);
            if (d > closest) break;
            closest = d;
        }
        // The geometry of the report: the aircraft passes EDSZ, within 0.5 NM of it
        expect(closest).toBeLessThan(0.5);
        const inbound = finalCourseDeg(edtz, edsz);
        const edtwLeg = courseDeg(edsz, edtw);
        const ednnLeg = courseDeg(edtw, ednn);
        for (let s = 0; s < RECORDED_S; s++) {
            await flight.fly(1);
            const ac = flight.aircraft;
            const distEdsz = distanceNm(ac, edsz);
            afterEdsz.push({
                ident: flight.nav.activeIdent, distEdsz, distEdtw: distanceNm(ac, edtw),
                offInbound: Math.abs(crossTrackNm(ac, edsz, inbound)),
                pastAbeam: distEdsz * Math.cos((courseDeg(edsz, ac) - inbound) * DEG),
                offEdtwLeg: Math.abs(crossTrackNm(ac, edsz, edtwLeg)),
                alongEdtwLeg: distEdsz * Math.cos((courseDeg(edsz, ac) - edtwLeg) * DEG),
                offEdnnLeg: Math.abs(crossTrackNm(ac, edtw, ednnLeg)),
            });
        }
        expect(afterEdsz).toHaveLength(RECORDED_S);
        // In the first minute the aircraft stays more than 12 NM from EDTW: no anticipated turn at EDTW (about 1.3 NM
        // before it at 120 kt for its 140° turn) and no passing of EDTW can be due then
        expect(Math.min(...afterEdsz.slice(0, FIRST_MINUTE).map(s => s.distEdtw))).toBeGreaterThan(12);
    });

    // 4-8, 5-33: a waypoint is sequenced as it is passed, or within the anticipated turn just before it. In the minute
    // after EDSZ EDTW is 13 NM away and moving farther, so neither is due, and the aircraft is still within 4.0 NM of the
    // leg into EDSZ, so the rule off the leg does not apply either: EDNN, the waypoint after EDTW, cannot become active.
    // The unit took EDNN two seconds after EDTW: the turn at EDSZ was still on the turn stack, which kept the waypoint
    // alert on for EDTW, and the old abeam test (alert on and the distance to the active waypoint no longer falling)
    // fired for EDTW
    it('does not take EDNN while the aircraft is 13 NM from EDTW (#375)', () => {
        expect(afterEdsz).toHaveLength(RECORDED_S);
        expect(afterEdsz.slice(0, FIRST_MINUTE).filter(s => s.ident === 'EDNN')).toEqual([]);
    });

    // What the rules of the trainer checks of 2026-10-20 (docs/kln89-trainer-record.md) do on this track, from the
    // geometry they read. The trainer cannot fly this track, because its aircraft always steers onto the active leg, so
    // nothing confirms it. The sim's earlier abeam sequencing on "the distance grows" (v2.2, the video of the report) took
    // EDSZ at once; there is no real-unit evidence for this case
    it('keeps EDSZ until it is sequenced off the leg at its abeam line, then takes EDNN at the inside bisector at EDTW (characterization)', () => {
        expect(afterEdsz).toHaveLength(RECORDED_S);
        const idents = afterEdsz.map(s => s.ident);
        const firstEdtw = idents.indexOf('EDTW');
        const firstEdnn = idents.indexOf('EDNN');
        expect(firstEdtw, JSON.stringify(idents)).toBeGreaterThan(FIRST_MINUTE);
        expect(firstEdnn, JSON.stringify(idents)).toBeGreaterThan(firstEdtw);
        expect(idents, 'EDSZ, then EDTW, then EDNN').toEqual(idents.map((_, i) => i < firstEdtw ? 'EDSZ' : i < firstEdnn ? 'EDTW' : 'EDNN'));

        // EDSZ: off the leg into it, and at its abeam line, where the distance to the leg equals the distance to EDSZ,
        // the nearest point of the next leg's segment from behind EDSZ. Before, the aircraft was within 4.0 NM of the
        // leg or short of the line
        const atEdtw = afterEdsz[firstEdtw];
        const beforeEdtw = afterEdsz[firstEdtw - 1];
        expect(atEdtw.offInbound).toBeGreaterThan(4.0);
        expect(atEdtw.pastAbeam).toBeGreaterThanOrEqual(-TOLERANCE_NM);
        expect(beforeEdtw.offInbound <= 4.0 + TOLERANCE_NM || beforeEdtw.pastAbeam <= TOLERANCE_NM, JSON.stringify(beforeEdtw)).toBe(true);
        expect(atEdtw.distEdsz).toBeGreaterThan(4.0);
        expect(atEdtw.distEdsz).toBeLessThan(4.5);

        // EDTW: off the leg from EDSZ, behind EDSZ on it (so its segment's distance is the distance to EDSZ), and where
        // the leg from EDTW to EDNN has come as close as EDSZ: the inside bisector of the turn at EDTW, far from EDTW
        const atEdnn = afterEdsz[firstEdnn];
        const beforeEdnn = afterEdsz[firstEdnn - 1];
        expect(atEdnn.offEdtwLeg).toBeGreaterThan(4.0);
        expect(atEdnn.alongEdtwLeg).toBeLessThan(0);
        expect(atEdnn.offEdnnLeg).toBeLessThanOrEqual(atEdnn.distEdsz + TOLERANCE_NM);
        expect(beforeEdnn.offEdnnLeg).toBeGreaterThanOrEqual(beforeEdnn.distEdsz - TOLERANCE_NM);
        expect(atEdnn.distEdtw).toBeGreaterThan(16);
    });
});
