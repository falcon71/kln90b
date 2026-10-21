import {describe, expect, it} from 'vitest';
import {Flight} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';
import {airport} from '../../harness/navdata/builders';
import {savedFlightplan} from '../../harness/storage';
import {distanceNm, LatLon, pointFrom} from '../../harness/flight/geo';
import {scriptedPath} from '../../harness/flight/pilots';

const dms = (d: number, m: number, s: number) => d + m / 60 + s / 3600;

/** The active waypoint once per second for 60 s after the closest approach to EDSZ, with the distance to EDTW */
const afterEdsz: { ident: string | null; distEdtw: number }[] = [];

/**
 * #375, reported from the sim: the flight plan of the report (its .pln; EDTZ and EDPT approximate, they are not on the
 * route that matters). The video of the report shows this simulator (v2.2), not a real KLN 90B. In it (45:20 to 45:46) the pilot flies VFR towards EDNN, not the EDSZ - EDTW leg: the
 * KLN shows EDSZ at 1.2 NM bearing 036°, 0.5 NM 047°, 0.2 NM 027° and 358°, so the aircraft turned right from about
 * 030° to about 080° and passed 0.2 NM south of EDSZ. The unit then showed EDSZ - EDTW (13.2 NM) and two seconds later
 * EDTW - EDNN. The track below is rebuilt from those readings.
 *
 * Since #375 an anticipated turn is sequenced where the aircraft passes the bisector of the turn, once the turn has
 * started (checked in the KLN 89 trainer, 2026-10-20, docs/kln89-trainer-record.md). On this track the aircraft flies
 * away while still TO EDSZ and never passes the bisector of the 36° left turn at EDSZ, so EDSZ stays active. The bug of
 * the report, EDNN taken while EDTW was 13 NM away, cannot happen either way: a waypoint is sequenced only by its own
 * turn, not by the turn of the waypoint before it. That mechanism, a previous turn still on the stack while the next
 * waypoint is active, is held by the corner-cutting test in bisectorSequencing.test.ts and the 2.0 NM leg test in
 * turnLead.test.ts.
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

        // 5.8 NM south-southwest of EDSZ the first leg is the closest, so EDSZ is active, as on the KLN in the video
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
        for (let s = 0; s < 60; s++) {
            await flight.fly(1);
            afterEdsz.push({ident: flight.nav.activeIdent, distEdtw: distanceNm(flight.aircraft, edtw)});
        }
        expect(afterEdsz).toHaveLength(60);
        // The aircraft stays more than 12 NM from EDTW: no anticipated turn at EDTW (about 1.3 NM before it at 120 kt
        // for its 140° turn) and no passing of EDTW can be due in this minute
        expect(Math.min(...afterEdsz.map(s => s.distEdtw))).toBeGreaterThan(12);
    });

    // 4-8, 5-33: a waypoint is sequenced as it is passed, or within the anticipated turn just before it. EDTW is 13 NM
    // away and moving farther, so neither is due and EDNN, the waypoint after EDTW, cannot become active. The unit took
    // EDNN two seconds after EDTW: the turn at EDSZ was still on the turn stack, which kept the waypoint alert on for
    // EDTW, and the old abeam test (alert on and the distance to the active waypoint no longer falling) fired for EDTW
    it('does not take EDNN while the aircraft is 13 NM from EDTW (#375)', () => {
        expect(afterEdsz).toHaveLength(60);
        expect(afterEdsz.filter(s => s.ident === 'EDNN')).toEqual([]);
    });

    // EDSZ stays active: this follows the bisector rule of the trainer checks of 2026-10-20 (docs/kln89-trainer-record.md),
    // since the aircraft never passes the bisector of the turn at EDSZ. The trainer cannot fly this case, because its
    // aircraft always steers onto the active leg, so nothing confirms it. The sim's earlier abeam sequencing on "the
    // distance grows" (v2.2, the video of the report) took EDSZ here; there is no real-unit evidence for this case
    it('keeps EDSZ active in the minute after passing it (characterization)', () => {
        expect(afterEdsz).toHaveLength(60);
        expect(afterEdsz.map(s => s.ident)).toEqual(afterEdsz.map(() => 'EDSZ'));
    });
});
