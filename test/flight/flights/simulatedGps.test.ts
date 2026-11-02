import {describe, expect, it, vi} from 'vitest';
import {LVAR_ROLL_COMMAND} from '../../../kln90b/LVars';
import {SimulatedMeasurement} from '../../../kln90b/GpsMeasurement';
import {GpsPositionFilter} from '../../../kln90b/GpsPositionFilter';
import {KLN90BPlatform} from '../../../kln90b/KLN90BPlatform';
import {Flight} from '../../harness/flight/Flight';
import {coupledAutopilot, ManualPilot, navModeAutopilot, Pilot} from '../../harness/flight/pilots';
import {World} from '../../harness/flight/World';
import {standardRoute} from '../../harness/fixtures';
import {savedFlightplan} from '../../harness/storage';
import {inhibitAllBut} from '../../harness/gps';
import {angleDiff, courseDeg, crossTrackNm, distanceNm, EARTH_RADIUS_NM, LatLon, pointFrom} from '../../harness/flight/geo';

/**
 * The simulated GPS receiver flown in the whole unit (#402, design 1 and 6.10): in normal conditions the pilot notices
 * nothing, and only a degraded solution shows the error. Every flight opts in to the simulated receiver with a fixed
 * seed. A bound marked "baseline" was set from the same flight with the exact strategy (measured 2026-11-01, the value
 * in the comment) plus a margin.
 *
 * The flight stage holds the filter only coarsely: a position gain off by a factor of 2 either way passes here. The unit
 * tests of GpsPositionFilter hold its numbers, so the glide bound below is no proof of the smoothing.
 */

const SEED = 402;
const RAD = Math.PI / 180;
const EARTH_RADIUS_M = EARTH_RADIUS_NM * 1852;

/** What one calculation tick of the GPS read and produced, while it had a fix */
interface TickSample {
    /** Seconds since the flight started */
    t: number;
    /** The sim position the tick read */
    truth: LatLon;
    /** The unit's position after the tick, copied (GPS.coords is one object updated in place) */
    gps: LatLon;
    /** GROUND VELOCITY the tick read, knots */
    truthGs: number;
    gs: number;
    trackTrue: number;
    /** getTrackTrueRespectingGroundspeed, the track the pages show */
    shownTrack: number | null;
    epeNm: number;
    satellites: number;
    /** The measured position the filter received in the tick (truth plus the receiver error), or null without a probe */
    measured: LatLon | null;
}

/** Reads the input of the simulated receiver's filter: the measured position before any smoothing */
interface FilterInputProbe {
    /** For Flight.start, beside simulatedGps: it wins over bootUnit's own SimulatedMeasurement */
    platform: Partial<KLN90BPlatform>;
    /** The measured position of the last filter update, null when there was none since the last reset */
    measured: LatLon | null;
}

/**
 * The receiver bootUnit's simulatedGps builds, with its filter's input recorded. The errors draw from the seeded
 * Math.random in the same order, so the flight is the same as without the probe.
 */
function filterInputProbe(): FilterInputProbe {
    const probe: FilterInputProbe = {
        measured: null,
        platform: {
            createGpsMeasurement: () => {
                const filter = new GpsPositionFilter();
                const update = filter.update.bind(filter);
                vi.spyOn(filter, 'update').mockImplementation((...args: Parameters<GpsPositionFilter['update']>) => {
                    probe.measured = {lat: args[1], lon: args[2]};
                    update(...args);
                });
                return new SimulatedMeasurement(() => Math.random(), undefined, filter);
            },
        },
    };
    return probe;
}

/**
 * Records a sample after every calculation tick of the GPS that ends with a fix. The physics loop does not run inside a
 * tick, so the SimVars read around it are the ones the tick read.
 */
function recordGpsTicks(flight: Flight, probe?: FilterInputProbe): TickSample[] {
    const gps = flight.unit.props.sensors.in.gps;
    const samples: TickSample[] = [];
    const tick = gps.tick.bind(gps);
    vi.spyOn(gps, 'tick').mockImplementation(() => {
        const truth = {lat: flight.sim.get('PLANE LATITUDE', 'degrees'), lon: flight.sim.get('PLANE LONGITUDE', 'degrees')};
        const truthGs = flight.sim.get('GROUND VELOCITY', 'knots');
        if (probe !== undefined) probe.measured = null;
        tick();
        if (!gps.isValid()) return;
        samples.push({
            t: flight.t, truth, gps: {lat: gps.coords.lat, lon: gps.coords.lon}, truthGs, gs: gps.groundspeed,
            trackTrue: gps.trackTrue, shownTrack: gps.getTrackTrueRespectingGroundspeed(), epeNm: gps.solution.epeNm,
            satellites: gps.solution.satellites, measured: probe?.measured ?? null,
        });
    });
    return samples;
}

/** The position error of a sample in meters */
const errorM = (s: TickSample) => distanceNm(s.truth, s.gps) * 1852;

/** The error of a position against the truth of the same tick, north and east in meters, flat earth (fine over meters) */
function errorNorthEast(truth: LatLon, p: LatLon): [number, number] {
    return [
        (p.lat - truth.lat) * RAD * EARTH_RADIUS_M,
        angleDiff(p.lon, truth.lon) * RAD * EARTH_RADIUS_M * Math.cos(truth.lat * RAD),
    ];
}

/** How far the error moved from one tick to the next, in meters: the move of the position beyond that of the truth (v·dt) */
function errorStepM(a: TickSample, b: TickSample, position: (s: TickSample) => LatLon): number {
    const [n0, e0] = errorNorthEast(a.truth, position(a));
    const [n1, e1] = errorNorthEast(b.truth, position(b));
    return Math.hypot(n1 - n0, e1 - e0);
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const stdDev = (xs: number[]) => {
    const m = mean(xs);
    return Math.sqrt(mean(xs.map(x => (x - m) ** 2)));
};
/** The p-th quantile (0 to 1), nearest rank */
const quantile = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.ceil(p * xs.length) - 1];
/** The absolute change from each sample to the next */
const steps = (xs: number[]) => xs.slice(1).map((x, i) => Math.abs(x - xs[i]));

/** Holds the wings level and sets the ground speed from the seconds since its creation, as on a takeoff roll */
function speedProfile(gsAt: (seconds: number) => number): Pilot {
    const t0 = Date.now();
    return {
        commandedBank: ({aircraft}) => {
            aircraft.groundspeedKt = gsAt((Date.now() - t0) / 1000);
            return 0;
        },
    };
}

/** Wings level from KAAA toward ABC, with no flight plan */
function startStraight(o: {
    simulatedGps: boolean, groundspeedKt: number, altitudeFt?: number, trackTrue?: number, storage?: Record<string, unknown>,
    platform?: Partial<KLN90BPlatform>,
}): Promise<Flight> {
    const {kaaa, abc, kbbb} = standardRoute();
    const world = new World({magvar: 0}).add(kaaa, abc, kbbb);
    return Flight.start({
        world, simulatedGps: o.simulatedGps, seed: SEED, storage: o.storage, platform: o.platform, pilot: new ManualPilot(),
        aircraft: {
            lat: kaaa.lat, lon: kaaa.lon, altitudeFt: o.altitudeFt ?? 3000, groundspeedKt: o.groundspeedKt,
            trackTrue: o.trackTrue ?? courseDeg(kaaa, abc),
        },
    });
}

interface RouteSample {
    /** The roll command of the pilot flown, positive right */
    roll: number;
    /** The aircraft's own cross track from the leg, geo.ts, positive right */
    xtkNm: number;
    simXtkNm: number;
    simTaeDeg: number;
}

interface LegRecord {
    /** The largest cross track on the far side after the first crossing of the leg, from the start of the leg; 0 without one */
    overshootNm: number;
    /** One a second on the straight part: from 60 s after the capture (|XTK| < 0.1 NM) to 5 NM before the waypoint */
    straight: RouteSample[];
}

/**
 * Flies the standard route KAAA - ABC - KBBB, starting 0.5 NM right of the first leg, 5 NM after KAAA. The straight
 * parts end 5 NM before the waypoints, before the turn anticipation and the waypoint alert.
 */
async function flyStandardRoute(o: { simulatedGps: boolean, pilot: Pilot, roll: (f: Flight) => number }): Promise<{ legs: LegRecord[], ticks: TickSample[] }> {
    const {kaaa, abc, kbbb} = standardRoute();
    const world = new World({magvar: 0}).add(kaaa, abc, kbbb);
    const leg1 = courseDeg(kaaa, abc);
    const start = pointFrom(pointFrom(kaaa, leg1, 5), leg1 + 90, 0.5);
    const flight = await Flight.start({
        world, simulatedGps: o.simulatedGps, seed: SEED, storage: savedFlightplan(0, [kaaa, abc, kbbb]), pilot: o.pilot,
        aircraft: {lat: start.lat, lon: start.lon, altitudeFt: 3000, groundspeedKt: 120, trackTrue: leg1},
    });
    const ticks = recordGpsTicks(flight);
    await flight.flyUntilActive('ABC', {timeout: 30});
    const legs: LegRecord[] = [];
    for (const [from, to, next] of [[kaaa, abc, 'KBBB'], [abc, kbbb, null]] as const) {
        const course = courseDeg(from, to);
        const xtk = () => crossTrackNm(flight.aircraft, from, course);
        const all: number[] = [];
        while (Math.abs(xtk()) >= 0.1) {
            if (all.length > 600) throw new Error(`no capture of the leg to ${to.icaoStruct.ident}`);
            await flight.fly(1);
            all.push(xtk());
        }
        for (let i = 0; i < 60; i++) {
            await flight.fly(1);
            all.push(xtk());
        }
        const straight: RouteSample[] = [];
        while (distanceNm(flight.aircraft, to) > 5) {
            if (straight.length > 3600) throw new Error(`not within 5 NM of ${to.icaoStruct.ident} after an hour`);
            await flight.fly(1);
            all.push(xtk());
            straight.push({
                roll: o.roll(flight), xtkNm: xtk(),
                simXtkNm: flight.sim.get('GPS WP CROSS TRK', 'nautical miles'), simTaeDeg: flight.sim.get('GPS WP TRACK ANGLE ERROR', 'degrees'),
            });
        }
        const startIdx = all.findIndex(x => Math.abs(x) >= 0.01);
        const side = startIdx < 0 ? 0 : Math.sign(all[startIdx]);
        const crossIdx = all.findIndex((x, i) => i > startIdx && Math.sign(x) === -side);
        legs.push({overshootNm: crossIdx < 0 ? 0 : Math.max(...all.slice(crossIdx).map(x => -side * x)), straight});
        if (next !== null) await flight.flyUntilActive(next, {timeout: 10 * 60});
    }
    return {legs, ticks};
}

/** Over the straight parts of all legs; the steps are taken within a leg only. The position error over the whole flight */
function routeMetrics({legs, ticks}: { legs: LegRecord[], ticks: TickSample[] }) {
    const all = legs.flatMap(l => l.straight);
    return {
        rollStdDev: stdDev(all.map(s => s.roll)),
        maxXtkNm: Math.max(...all.map(s => Math.abs(s.xtkNm))),
        maxSimXtkStepNm: Math.max(...legs.flatMap(l => steps(l.straight.map(s => s.simXtkNm)))),
        maxSimTaeStepDeg: Math.max(...legs.flatMap(l => steps(l.straight.map(s => s.simTaeDeg)))),
        maxOvershootNm: Math.max(...legs.map(l => l.overshootNm)),
        samples: all.length,
        maxPositionErrorM: Math.max(...ticks.map(errorM)),
    };
}

describe('simulated GPS receiver (#402)', () => {
    it('stays inside the EPE over an hour of straight flight', async () => {
        const flight = await startStraight({simulatedGps: true, groundspeedKt: 120});
        const samples = recordGpsTicks(flight);
        await flight.fly(3600);

        expect(samples.length).toBeGreaterThanOrEqual(3590);
        // Design 6.10: STA 2's EPE is a 95% estimate (2 HDOP σ_UERE); the slow ranging error (τ = 300 s) makes the hour
        // a dozen correlation times
        const inside = samples.filter(s => errorM(s) <= s.epeNm * 1852).length;
        expect(inside / samples.length).toBeGreaterThanOrEqual(0.9);
        expect(Math.max(...samples.map(errorM))).toBeGreaterThan(0);
    });

    it('follows a takeoff acceleration', async () => {
        const {kaaa} = standardRoute();
        const runway = kaaa.runways[0].direction;
        const flight = await startStraight({simulatedGps: true, groundspeedKt: 0, altitudeFt: 0, trackTrue: runway});
        await flight.fly(10);
        const samples = recordGpsTicks(flight);
        // Design 6.10: from standstill, 4 kt/s to 120 kt, on the runway
        flight.pilot = speedProfile(t => Math.min(120, 4 * t));
        await flight.fly(40);

        const rolling = samples.findIndex(s => s.truthGs > 0);
        expect(rolling).toBeGreaterThanOrEqual(0);
        const fromSecondTick = samples.slice(rolling + 1);
        // The whole acceleration and the end of it
        expect(fromSecondTick.filter(s => s.truthGs > 2 && s.truthGs < 118).length).toBeGreaterThanOrEqual(25);
        expect(fromSecondTick[fromSecondTick.length - 1].truthGs).toBe(120);
        const gsErrors = fromSecondTick.map(s => Math.abs(s.gs - s.truthGs));
        expect(Math.max(...gsErrors), 'the simulated receiver is in use: GS is measured, not GROUND VELOCITY').toBeGreaterThan(0);
        for (const s of fromSecondTick) {
            expect(Math.abs(s.gs - s.truthGs), `GS ${s.gs.toFixed(2)} kt at ${s.truthGs.toFixed(2)} kt (t = ${s.t.toFixed(1)} s)`).toBeLessThanOrEqual(1);
        }
    });

    it('keeps the track steady', async () => {
        const flight = await startStraight({simulatedGps: true, groundspeedKt: 0});
        await flight.panel.selectPage('L', 'NAV 3');
        const samples = recordGpsTicks(flight);
        const shownTk = () => flight.screen.rows('L')[2];

        // 3-35: below 2 kt no track; at standstill the measured ground speed is a fraction of a knot
        for (let i = 0; i < 10; i++) {
            await flight.fly(1);
            expect(shownTk()).toMatch(/^TK +-+/);
        }
        expect(samples.length).toBeGreaterThanOrEqual(9);
        expect(samples.every(s => s.shownTrack === null)).toBe(true);

        flight.aircraft.groundspeedKt = 120;
        await flight.fly(5);
        const cruiseFrom = samples.length;
        for (let i = 0; i < 600; i++) {
            await flight.fly(1);
            const shown = /^TK +(\d{3})/.exec(shownTk());
            expect(shown, shownTk()).not.toBeNull();
            // The world has no variation, so the magnetic track shown is the true one
            expect(Math.abs(angleDiff(Number(shown![1]), flight.aircraft.trackTrue)), shownTk()).toBeLessThanOrEqual(1);
        }
        const cruise = samples.slice(cruiseFrom);
        expect(cruise.length).toBeGreaterThanOrEqual(590);
        expect(Math.max(...cruise.map(errorM)), 'the simulated receiver is in use').toBeGreaterThan(0);
        // Design 6.10: the 99th percentile, not the largest, because σ_d is not tuned to pass a test
        const trackSteps = cruise.slice(1).map((s, i) => Math.abs(angleDiff(s.trackTrue, cruise[i].trackTrue)));
        expect(quantile(trackSteps, 0.99)).toBeLessThan(0.2);
    });

    it('does not weave on roll steering', async () => {
        const m = routeMetrics(await flyStandardRoute({simulatedGps: true, pilot: coupledAutopilot(), roll: f => -f.sim.get(LVAR_ROLL_COMMAND, 'degrees')}));

        // Design 6.8: roll steering steers on the measured track as it is. The margins are a tenth of a degree of bank and
        // a few meters, far below what a pilot notices, and above the Doppler noise of the measured track
        expect(m.samples).toBeGreaterThan(1500);
        expect(m.maxPositionErrorM, 'the simulated receiver is in use').toBeGreaterThan(0);
        expect(m.rollStdDev).toBeLessThan(0.1); // baseline 0.014°
        expect(m.maxXtkNm).toBeLessThan(0.015); // baseline 0.0082 NM
    });

    it('does not weave on a NAV-mode autopilot', async () => {
        const pilot = navModeAutopilot();
        const m = routeMetrics(await flyStandardRoute({simulatedGps: true, pilot, roll: f => pilot.commandedBank({sim: f.sim, aircraft: f.aircraft})}));

        // Design 6.10: most users fly the sim's autopilot on the GPS SimVars. Margins as for roll steering. The exact
        // strategy's track is the bearing between two exact positions, so its TAE barely moves on a straight leg; the
        // measured track moves by its Doppler noise (the 99th percentile of the track test), and the bound is where the
        // TAE gain of the autopilot (1.2) would turn it into half a degree of bank
        expect(m.samples).toBeGreaterThan(1500);
        expect(m.maxPositionErrorM, 'the simulated receiver is in use').toBeGreaterThan(0);
        // Measured 2026-11-01: 0.000003 NM with the exact strategy, 0.0013 NM with the simulated one
        expect(m.maxOvershootNm).toBeLessThan(0.01);
        expect(m.rollStdDev).toBeLessThan(0.1); // baseline 0.0085°
        expect(m.maxXtkNm).toBeLessThan(0.01); // baseline 0.0042 NM
        expect(m.maxSimXtkStepNm).toBeLessThan(0.002); // baseline 0.00022 NM
        expect(m.maxSimTaeStepDeg).toBeLessThan(0.4); // baseline 0.019°
    });

    it('does not jump when satellites leave', async () => {
        const probe = filterInputProbe();
        const flight = await startStraight({simulatedGps: true, groundspeedKt: 120, platform: probe.platform});
        const samples = recordGpsTicks(flight, probe);
        await flight.fly(120);
        const inhibited = samples.length;
        inhibitAllBut(flight.unit, 4);
        await flight.fly(120);

        // The four satellites take over from all eight at once, at the SDK's next position update
        expect(samples[inhibited - 1].satellites).toBe(8);
        const loss = samples.findIndex(s => s.satellites === 4);
        expect(loss).toBeGreaterThanOrEqual(inhibited);
        expect(samples[loss - 1].satellites).toBe(8);
        expect(samples.slice(loss).every(s => s.satellites === 4)).toBe(true);
        // The measured position steps at the loss (the four kept satellites map their errors differently, and the
        // errors of the others drop out). Its size depends on the seed: 1.6 to 30 m over
        // sixteen seeds measured 2026-11-01, 30 m with this one, which therefore has a step worth gliding
        expect(errorStepM(samples[loss - 1], samples[loss], s => s.measured!)).toBeGreaterThanOrEqual(10);
        // Design 6.10: beyond the move of the truth between two ticks (v·dt), the position moves at most 5 m per tick,
        // from 5 s before the loss on. Held tighter here: the largest step is 1.18 m with this seed (measured 2026-11-02,
        // 3.48 m while the harness still gave each tick a position up to 62 ms stale, #457), so a weaker glide fails too
        for (let i = loss - 5; i < samples.length; i++) {
            expect(errorStepM(samples[i - 1], samples[i], s => s.gps), `t = ${samples[i].t.toFixed(1)} s`).toBeLessThanOrEqual(2);
        }
    });

    describe('a wrong altimeter setting', () => {
        /**
         * Flies 300 s with the right setting and 300 s with 30.92 inHg, in one flight, and returns the mean position error
         * of each. The gray-code altitude input of the default panel gives the solution the unit's indicated altitude
         * (5-29). The harness writes PRESSURE ALTITUDE = PLANE ALTITUDE, so 30.92 reads about 900 ft high.
         * @param satellites How many satellites are kept, null for all
         */
        async function meanErrors(satellites: number | null): Promise<{ right: number, wrong: number }> {
            const flight = await startStraight({simulatedGps: true, groundspeedKt: 120});
            await flight.fly(30);
            if (satellites !== null) inhibitAllBut(flight.unit, satellites);
            await flight.fly(20);
            const samples = recordGpsTicks(flight);
            const airdata = flight.unit.props.sensors.in.airdata;
            expect(airdata.barometer).toBe(29.92);
            await flight.fly(300);
            const rightEnd = samples.length;
            airdata.barometer = 30.92;
            // The position glides in over several seconds
            await flight.fly(30);
            const wrongStart = samples.length;
            await flight.fly(300);

            expect(rightEnd).toBeGreaterThanOrEqual(290);
            expect(samples.length - wrongStart).toBeGreaterThanOrEqual(290);
            expect(samples.every(s => satellites === null ? s.satellites > 4 : s.satellites === satellites)).toBe(true);
            return {right: mean(samples.slice(0, rightEnd).map(errorM)), wrong: mean(samples.slice(wrongStart).map(errorM))};
        }

        it('degrades three satellites plus altitude', async () => {
            const {right, wrong} = await meanErrors(3);
            // Design 1 and 6.10: with three satellites the altitude carries the solution, so the 1000 ft show
            expect(wrong).toBeGreaterThanOrEqual(5 * right);
        });

        it('hardly degrades all satellites', async () => {
            const {right, wrong} = await meanErrors(null);

            // With all satellites the altitude row has little weight: measured 2026-11-01, 4.8 m with the right setting
            // and 2.6 m with the wrong one (the slow errors drift between the two windows), against 456 m with three
            expect(Math.max(right, wrong)).toBeLessThan(25);
        });
    });
});
