import {describe, expect, it} from 'vitest';
import {Flight} from '../../harness/flight/Flight';
import {AircraftProfile, TURBINE_DUKE} from '../../harness/flight/pilots';
import {World} from '../../harness/flight/World';
import {intersection} from '../../harness/navdata/builders';
import {savedFlightplan} from '../../harness/storage';
import {angleBetween, angleDiff, courseDeg, crossTrackNm, LatLon, pointFrom} from '../../harness/flight/geo';

/**
 * How an aircraft measured in the sim flies the unit's anticipated turns, per turn from the DTK switch (4-8), measured
 * against the next leg with the aircraft's own position
 */
interface TurnMetrics {
    /** Seconds from the DTK switch to the first sample with more than 3° of bank */
    onsetS: number;
    /** The largest bank in the 90 s after the switch, degrees */
    maxBankDeg: number;
    /** The distance inside the next leg (toward the turn's side) at the first sample after the roll-in with less than 3° of bank, m */
    rolloutInsideM: number;
    /** The largest distance inside the next leg once the track is within 25° of it, m */
    peakInsideM: number;
    /** Seconds from the switch to that largest distance */
    peakS: number;
    /** Seconds from the switch to the first sample under 30 m inside after the peak */
    under30mS: number;
    /** The largest distance outside the next leg after the peak, m */
    outsideM: number;
    /** The mean angle at which the track closes on the next leg while more than 60 m inside it, from 5 s after the peak, degrees */
    closingDeg: number;
}

type Band = [number, number];

interface Measured {
    profile: AircraftProfile;
    groundspeedKt: number;
    /** What the sim showed, per turn metric, as [min, max] */
    bands: Record<keyof TurnMetrics, Band>;
}

/**
 * The aircraft measured in the sim, with the bands their turns must stay in. A band holds what the sim showed plus a
 * margin; a change in the unit's turns that moves a metric out of it changes how these aircraft fly, which may be
 * intended, but has to be seen
 */
const MEASURED: Measured[] = [
    {
        // Flight A of 2026-11-02 (docs/sim-flight-record.md), three 90° turns at 125 to 131 kt with the roll-in: bank after
        // 2 to 3 s, 26.8° to 27.2°, 221 to 314 m inside at the rollout, 311 to 411 m inside at most 21 s after the switch,
        // under 30 m 43 to 53 s after it, then 39 to 69 m outside, closing at 9.4° to 10.2°. The model gives 251 to 253,
        // 354 to 358, 45 s, 56 m and 10.8°
        profile: TURBINE_DUKE,
        groundspeedKt: 130,
        bands: {
            onsetS: [2, 4],
            maxBankDeg: [26.5, 27.5],
            rolloutInsideM: [200, 330],
            peakInsideM: [300, 420],
            peakS: [19, 23],
            under30mS: [40, 60],
            outsideM: [30, 80],
            closingDeg: [8, 12],
        },
    },
];

/** Seconds measured after each DTK switch */
const MEASURE_S = 90;

/**
 * The geometry of the sim flights of 2026-11-02 (docs/sim-flight-record.md): from a heading of 150 at the KTTS runway, TF1
 * ahead, then 90° right to TF2, 90° left to TF3 and 90° right to TF4. The legs after TF1 are 5 NM instead of the sim's
 * 2 to 3.5 NM, so that every turn starts with the aircraft established on its leg, as the Duke was in the sim; the model
 * settles more slowly than it did. WP0 lies behind the start, so the aircraft begins on the leg WP0 - TF1, 4 NM before TF1
 */
function route(): { start: LatLon; idents: string[]; points: LatLon[]; turns: number[] } {
    const start = {lat: 28.63, lon: -80.70};
    const idents = ['WP0', 'TF1', 'TF2', 'TF3', 'TF4'];
    const turns = [0, 0, 90, -90, 90];
    const lengths = [0, 6, 5, 5, 5];
    const points = [pointFrom(start, 150 + 180, 2)];
    let course = 150;
    for (let i = 1; i < idents.length; i++) {
        course += turns[i];
        points.push(pointFrom(points[i - 1], course, lengths[i]));
    }
    return {start, idents, points, turns};
}

interface Sample {
    t: number;
    insideM: number;
    bankDeg: number;
    /** The track's angle toward the turn's side of the next leg's course, degrees */
    trackOffDeg: number;
}

function metricsOf(s: Sample[]): TurnMetrics {
    const onset = s.find(x => x.bankDeg > 3);
    if (onset === undefined) throw new Error('no bank after the DTK switch');
    const rollout = s.find(x => x.t > onset.t + 5 && x.bankDeg < 3);
    const aligned = s.filter(x => Math.abs(x.trackOffDeg) < 25);
    const peak = aligned.reduce((m, x) => x.insideM > m.insideM ? x : m, aligned[0]);
    const afterPeak = aligned.filter(x => x.t > peak.t);
    const closing = aligned.filter(x => x.t > peak.t + 5 && x.insideM > 60);
    return {
        onsetS: onset.t,
        maxBankDeg: Math.max(...s.map(x => x.bankDeg)),
        rolloutInsideM: rollout?.insideM ?? NaN,
        peakInsideM: peak.insideM,
        peakS: peak.t,
        under30mS: afterPeak.find(x => x.insideM < 30)?.t ?? NaN,
        outsideM: -Math.min(...afterPeak.map(x => x.insideM)),
        // Closing on the leg from the inside the track points away from the turn's side
        closingDeg: closing.length === 0 ? NaN : -closing.reduce((a, x) => a + x.trackOffDeg, 0) / closing.length,
    };
}

async function flyTurns(m: Measured): Promise<TurnMetrics[]> {
    const {start, idents, points, turns} = route();
    const facilities = points.map((p, i) => intersection(idents[i], p.lat, p.lon));
    const flight = await Flight.start({
        world: new World({magvar: 0}).add(...facilities), storage: savedFlightplan(0, facilities),
        pilot: m.profile.pilot(), aircraftOptions: m.profile.aircraftOptions,
        aircraft: {lat: start.lat, lon: start.lon, altitudeFt: 3000, groundspeedKt: m.groundspeedKt, trackTrue: courseDeg(start, points[1])},
    });
    const result: TurnMetrics[] = [];
    for (let k = 1; k <= 3; k++) {
        const wpt = points[k];
        const next = courseDeg(wpt, points[k + 1]);
        const side = Math.sign(turns[k + 1]);
        // The worlds have magvar 0, so the unit's DTK is the true course
        await flight.flyUntil(() => angleBetween(flight.nav.dtkTrue, next) < 1, {timeout: 300, description: `DTK switch at ${idents[k]}`});
        expect(flight.nav.activeIdent, 'the turn is anticipated: the switch comes before the sequencing').toBe(idents[k]);
        const samples: Sample[] = [];
        for (let t = 0; t <= MEASURE_S; t++) {
            samples.push({
                t,
                insideM: side * crossTrackNm(flight.aircraft, wpt, next) * 1852,
                bankDeg: Math.abs(flight.aircraft.bankDeg),
                trackOffDeg: side * angleDiff(flight.aircraft.trackTrue, next),
            });
            await flight.fly(1);
        }
        result.push(metricsOf(samples));
    }
    return result;
}

describe('anticipated turns flown by aircraft measured in the sim', () => {
    for (const m of MEASURED) {
        it(`${m.profile.name}: three 90° turns at ${m.groundspeedKt} kt stay within the sim's measurement`, async () => {
            const turns = await flyTurns(m);
            console.log(`${m.profile.name}: ${JSON.stringify(turns, (k, v) => typeof v === 'number' ? Math.round(v * 10) / 10 : v)}`);
            turns.forEach((turn, i) => {
                for (const [key, [min, max]] of Object.entries(m.bands) as [keyof TurnMetrics, Band][]) {
                    const label = `turn ${i + 1} ${key} ${turn[key].toFixed(1)} within [${min}, ${max}]: ${JSON.stringify(turn)}`;
                    expect(turn[key], label).toBeGreaterThanOrEqual(min);
                    expect(turn[key], label).toBeLessThanOrEqual(max);
                }
            });
        });
    }
});
