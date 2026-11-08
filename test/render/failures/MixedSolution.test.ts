import {afterEach, describe, expect, it, vi} from 'vitest';
import {GeoPoint, LatLonInterface} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, settle, untilCalcTick} from '../../harness/boot';
import {spooferAt} from '../../harness/gps';
import {LatLon, pointFrom} from '../../harness/flight/geo';
import {messages} from '../../harness/readers';
import {NO_ALTIMETER, panelXml} from '../../harness/panelXml';
import {spooferPowerDb} from '../../../kln90b/GpsTransmitter';
import {SpooferSite} from '../../../kln90b/failures/Transmitters';
import {powerForLevelDb} from '../../harness/transmitterGain';

/**
 * #465: the unit's solution with a spoofer's fake satellites in it (design docs/superpowers/specs/2026-11-07-gps-jamming-
 * spoofing-transmitters-design.md, "The solution", "RAIM detection" and "Kept from the issue"). A unit on the ground 5 NM from
 * a spoofer two hours ahead: the fake satellites of the PRNs up in both skies give it a fix, which moves its belief to the
 * false position and time, and it then searches the fake sky. Every row claims the false state, so the solution is that
 * state exactly
 */

const HOME: LatLon = {lat: 47, lon: 8};
const SHIFT_MS = 2 * 3600 * 1000;
const POSITION_ERROR = 'RAIM POSITION ERROR CROSS CHECK POSITION';
const TIME_UPDATED = 'SYSTEM TIME UPDATED TO GPS TIME';
const C_M_PER_MS = 299_792.458;

afterEach(() => {
    vi.restoreAllMocks();
});

/** A spoofer 5 NM from HOME, its false position 60 NM from it */
function spoofer(falseAltFt: number, clockM: number): SpooferSite {
    const p = pointFrom(HOME, 200, 5);
    const f = pointFrom(p, 20, 60);
    return {lat: p.lat, lon: p.lon, powerDb: spooferPowerDb(300), refAglFt: 10_000, falseLat: f.lat, falseLon: f.lon, falseAltFt, shiftMs: SHIFT_MS, clockM};
}

const nmBetween = (a: LatLonInterface, b: LatLonInterface) => new GeoPoint(a.lat, a.lon).distance(b.lat, b.lon) * 3437.7468;

/**
 * Boots at HOME, on the ground at the given altitude, and waits until every channel holds a fake satellite in use and the
 * unit believes the false time. Returns the unit's clock against the true time in the calculation tick of its first fix
 */
async function captured(site: SpooferSite, panel: Record<string, unknown> = {}, altitudeFt = 0): Promise<{ unit: HeadlessUnit, firstFixClockMs: number }> {
    const unit = await bootUnit({
        panelXml: panelXml(panel), altitudeFt, simVars: [{name: 'PLANE ALT ABOVE GROUND', unit: 'feet', value: 0}],
        storage: {lastLatitude: HOME.lat, lastLongitude: HOME.lon, fastGpsAcquisition: false, ...spooferAt(site)},
    });
    const gps = unit.props.sensors.in.gps;
    gps.fakeReceiver.jitterScale = 0;
    let firstFixClockMs = NaN;
    for (let s = 0; s < 20 * 60 && !(gps.isValid() && gps.fakeReceiver.believesFalse && gps.fakeReceiver.inUsePrns().length === 8); s++) {
        await untilCalcTick(unit);
        if (gps.isValid() && Number.isNaN(firstFixClockMs)) {
            firstFixClockMs = gps.timeZulu.getTimestamp() - gps.simTimeUnix;
        }
    }
    expect(gps.fakeReceiver.inUsePrns().length).toBe(8); // Preconditions
    expect(gps.isValid()).toBe(true);
    await untilCalcTick(unit);
    return {unit, firstFixClockMs};
}

/** The rows of G for lines of sight given as [zenith, hour angle]: [sin z cos a, sin z sin a, cos z, 1], the altitude [0, 0, 5/30, 0] */
function rowsOf(lines: [number, number][], altitude: boolean): number[][] {
    const g = lines.map(([z, a]) => [Math.sin(z) * Math.cos(a), Math.sin(z) * Math.sin(a), Math.cos(z), 1]);
    if (altitude) {
        g.push([0, 0, 5 / 30, 0]);
    }
    return g;
}

/** The slant range to a satellite on the orbit radius (26,560 km) over an earth of 6,371 km, by a bisection on the orbit */
function rangeAt(sinElevation: number): number {
    const cos = Math.sqrt(1 - sinElevation * sinElevation);
    let lo = 0;
    let hi = 60_000_000;
    for (let i = 0; i < 200; i++) {
        const d = (lo + hi) / 2;
        const x = d * cos;
        const y = 6_371_000 + d * sinElevation;
        if (x * x + y * y < 26_560_000 * 26_560_000) {
            lo = d;
        } else {
            hi = d;
        }
    }
    return (lo + hi) / 2;
}

/** The test's own least squares: the shift north and east of the solution for the rows' errors, and the residual */
function fitOf(g: number[][], errors: number[]): { north: number, east: number, sse: number } {
    const a = [0, 1, 2, 3].map(r => [0, 1, 2, 3].map(c => g.reduce((sum, row) => sum + row[r] * row[c], 0))
        .concat([g.reduce((sum, row, i) => sum + row[r] * errors[i], 0)]));
    for (let col = 0; col < 4; col++) {
        let p = col;
        for (let r = col + 1; r < 4; r++) {
            if (Math.abs(a[r][col]) > Math.abs(a[p][col])) {
                p = r;
            }
        }
        [a[col], a[p]] = [a[p], a[col]];
        const pivot = a[col][col];
        for (let c = 0; c < 5; c++) {
            a[col][c] /= pivot;
        }
        for (let r = 0; r < 4; r++) {
            if (r !== col) {
                const f = a[r][col];
                for (let c = 0; c < 5; c++) {
                    a[r][c] -= f * a[col][c];
                }
            }
        }
    }
    const x = a.map(row => row[4]);
    const sse = g.reduce((sum, row, i) => {
        const res = errors[i] - row.reduce((t, v, c) => t + v * x[c], 0);
        return sum + res * res;
    }, 0);
    return {north: -x[0], east: x[1], sse};
}

/** The test's own HDOP of rows given as [zenith, hour angle] */
function hdopOf(lines: [number, number][], altitude: boolean): number {
    const g = rowsOf(lines, altitude);
    // (GᵀG)⁻¹ by Gauss-Jordan on [GᵀG | I]
    const a = [0, 1, 2, 3].map(r => [0, 1, 2, 3].map(c => g.reduce((sum, row) => sum + row[r] * row[c], 0)).concat([0, 1, 2, 3].map(c => r === c ? 1 : 0)));
    for (let col = 0; col < 4; col++) {
        let p = col;
        for (let r = col + 1; r < 4; r++) {
            if (Math.abs(a[r][col]) > Math.abs(a[p][col])) {
                p = r;
            }
        }
        [a[col], a[p]] = [a[p], a[col]];
        const pivot = a[col][col];
        for (let c = 0; c < 8; c++) {
            a[col][c] /= pivot;
        }
        for (let r = 0; r < 4; r++) {
            if (r !== col) {
                const f = a[r][col];
                for (let c = 0; c < 8; c++) {
                    a[r][c] -= f * a[col][c];
                }
            }
        }
    }
    return Math.sqrt(a[0][4] + a[1][5]);
}

describe('the mixed solution (#465)', () => {
    // The clock offset stored here is 10.5 ms, beyond the draw's half millisecond, so that the whole milliseconds of the
    // unit's clock (a Date) show it
    it('captured: the false position, ground speed 0, the false time plus the clock offset, SYSTEM TIME UPDATED', async () => {
        const site = spoofer(0, 10.5 * C_M_PER_MS);
        const {unit, firstFixClockMs} = await captured(site, NO_ALTIMETER);
        const gps = unit.props.sensors.in.gps;

        expect(gps.rangeErrors.falseReference).toBe(true);
        expect(gps.solution.satellites).toBe(8);
        // The geometry is the fake sky's at the false position, not the real sky's
        const prns: number[] = [...(gps as any).solutionPrns];
        const fakeHdop = hdopOf(prns.map(p => [gps.fakeReceiver.fakeZenith(p), gps.fakeReceiver.fakeHourAngle(p)]), false);
        const sdk = gps.gpsSatComputer.getSatellites();
        const realHdop = hdopOf(prns.map(p => [...sdk.find(x => x.prn === p)!.position.get()] as [number, number]), false);
        expect(Math.abs(fakeHdop - realHdop)).toBeGreaterThan(0.01); // Precondition: the two skies tell apart
        expect(gps.solution.hdop).toBeCloseTo(fakeHdop, 9);
        // The first fix already takes the false time
        expect(firstFixClockMs).toBeGreaterThanOrEqual(SHIFT_MS + 10);
        expect(firstFixClockMs).toBeLessThanOrEqual(SHIFT_MS + 11);
        // Every row claims the false state: the solution is that state exactly (GeoPoint normalizes the angles it is given)
        expect([gps.rangeErrors.northM, gps.rangeErrors.eastM, gps.rangeErrors.sseM2]).toEqual([0, 0, 0]);
        expect(gps.coords.lat).toBeCloseTo(site.falseLat, 10);
        expect(gps.coords.lon).toBeCloseTo(site.falseLon, 10);
        expect(gps.groundspeed).toBe(0);
        const clockMs = gps.timeZulu.getTimestamp() - (gps.simTimeUnix + SHIFT_MS);
        expect(clockMs).toBeGreaterThanOrEqual(10);
        expect(clockMs).toBeLessThanOrEqual(11);
        // The SDK's receiver keeps the true time
        expect(gps.gpsSatComputer.internalTime).toBe(gps.simTimeUnix);
        expect(messages(unit)).toContain(TIME_UPDATED);
        // Without an altitude input the fake rows are consistent: RAIM sees nothing
        expect(gps.rangeErrorDetected(2)).toBe(false);
        expect(messages(unit)).not.toContain(POSITION_ERROR);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // Design, "Kept from the issue": a false position beyond 100 NM would send the SDK into a blind search
    it('captured: the SDK\'s last known position is the true one', async () => {
        const site = spoofer(0, 0);
        const {unit} = await captured(site, NO_ALTIMETER);
        const gps = unit.props.sensors.in.gps;
        const synced: LatLon[] = [];
        vi.spyOn(gps.gpsSatComputer, 'syncLastKnownPosition').mockImplementation(pos => {
            synced.push({lat: pos!.lat, lon: pos!.lon});
        });
        await untilCalcTick(unit);

        expect(nmBetween(gps.coords, {lat: site.falseLat, lon: site.falseLon})).toBeLessThan(0.01); // Precondition
        expect(synced).toEqual([HOME]);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // Design, "RAIM detection": the altitude input disagrees with the fake rows by the aircraft's height above the false
    // ground. On the ground under a false airport 5,000 ft high, the input reads 5,000 ft below it
    it('captured with an altitude input that disagrees with the false altitude: RAIM POSITION ERROR', async () => {
        const {unit} = await captured(spoofer(5000, 0));
        const gps = unit.props.sensors.in.gps;

        expect(gps.solution.altitudeAided).toBe(true); // Preconditions
        expect(gps.solution.measurements).toBe(9);
        expect(gps.rangeErrorDetected(2)).toBe(true);
        // RAIM must be available for the alert limit: no geometry protects one of 0.001 NM
        expect(gps.rangeErrorDetected(0.001)).toBe(false);
        expect(messages(unit)).toContain(POSITION_ERROR);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // On the ground at 5,000 ft under a false airport as high: the input agrees, in feet or meters alike
    it('captured with an altitude input that agrees with the false altitude: no RAIM POSITION ERROR', async () => {
        const {unit} = await captured(spoofer(5000, 0), {}, 5000);
        const gps = unit.props.sensors.in.gps;

        expect(gps.solution.altitudeAided).toBe(true); // Preconditions
        expect(Math.abs(unit.props.sensors.in.airdata.getIndicatedAlt()! - 5000)).toBeLessThan(100);
        expect(gps.rangeErrorDetected(2)).toBe(false);
        expect(messages(unit)).not.toContain(POSITION_ERROR);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // In flight at 10,000 ft, 80 NM from a spoofer whose fake signals together are 11.5 dB over the noise there, without a
    // time shift: the low real satellites are drowned and fake ones take their channels, the high real ones stay. The real
    // rows are the majority, so the solution is the true state moved by the fake rows' errors: each the fake range (its
    // elevation in the fake sky) plus the clock offset and the spoofer's slant range minus the true range (its elevation in
    // the real sky), less the whole milliseconds resolved for it. The power is set from that level with the test harness's
    // gain toward the spoofer, 1.66 degrees under the horizon
    it('the mixed phase: the true state moved by the range errors of the fake rows', async () => {
        const p = pointFrom(HOME, 200, 80);
        const f = pointFrom(p, 20, 60);
        const powerDb = powerForLevelDb(11.5, 80, 10_000);
        const site: SpooferSite = {lat: p.lat, lon: p.lon, powerDb, refAglFt: 10_000, falseLat: f.lat, falseLon: f.lon, falseAltFt: 0, shiftMs: 0, clockM: 50_000};
        const unit = await bootUnit({
            altitudeFt: 10_000, storage: {lastLatitude: HOME.lat, lastLongitude: HOME.lon, ...spooferAt(site)},
            simVars: [{name: 'PLANE ALT ABOVE GROUND', unit: 'feet', value: 10_000}, {name: 'SIM ON GROUND', unit: 'bool', value: false}],
        });
        const gps = unit.props.sensors.in.gps;
        gps.signals.fadeScale = 0;
        gps.signals.jitterScale = 0;
        gps.fakeReceiver.jitterScale = 0;
        const fakeRows = () => gps.fakeReceiver.inUsePrns().filter(prn => ((gps as any).solutionPrns as number[]).includes(prn));
        for (let s = 0; s < 600 && !(gps.isValid() && fakeRows().length > 0); s++) {
            await untilCalcTick(unit);
        }
        const prns: number[] = [...(gps as any).solutionPrns];
        const fakes = fakeRows();
        expect(fakes.length).toBeGreaterThan(0); // Preconditions: a mixed solution with the true reference
        expect(fakes.length * 2).toBeLessThan(prns.length);
        expect(gps.rangeErrors.falseReference).toBe(false);

        const sdk = gps.gpsSatComputer.getSatellites();
        const trueLine = (prn: number) => [...sdk.find(x => x.prn === prn)!.position.get()] as [number, number];
        // The whole milliseconds are read from the module: their rule (resolved at the entry and a flip, held between) is
        // held by RangeErrors.test.ts; this test holds the ranges Gps gives it
        const wholeMs: Int32Array = (gps.rangeErrors as any).wholeMs;
        // Final review (2026-11-08): a fake signal also travels the spoofer's slant range to the aircraft, 80 NM across and
        // 9,900 ft up from the mast's top
        const slantM = Math.hypot(80 * 1852, 9900 * 0.3048);
        const errors = prns.map(prn => fakes.includes(prn)
            ? rangeAt(Math.cos(gps.fakeReceiver.fakeZenith(prn))) + 50_000 + slantM - rangeAt(Math.cos(trueLine(prn)[0])) - wholeMs[prn] * C_M_PER_MS
            : 0);
        for (const e of errors) {
            expect(Math.abs(e)).toBeLessThan(C_M_PER_MS); // Within a millisecond: resolved at the entry, drifted since
        }
        expect(errors.some(e => Math.abs(e) > 100)).toBe(true);
        const g = rowsOf(prns.map(trueLine), gps.solution.altitudeAided);
        const expected = fitOf(g, gps.solution.altitudeAided ? [...errors, 0] : errors);
        expect(gps.rangeErrors.northM).toBeCloseTo(expected.north, 2);
        expect(gps.rangeErrors.eastM).toBeCloseTo(expected.east, 2);
        expect(gps.rangeErrors.sseM2).toBeCloseTo(expected.sse, -1);
        expect(Math.hypot(expected.north, expected.east)).toBeGreaterThan(50);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // Design, "The solution": the reference state is the one most satellite rows claim. The altitude row claims none and
    // does not vote: four fake rows against three real ones and the altitude are the false state. The rows are set up through
    // the fake receiver's interface: four of the SDK's satellites in use are claimed and stand in as fake rows, in their own
    // directions, and the rest but three are held too
    it('the altitude row does not vote: four fake rows beat three real ones with an altitude input', async () => {
        const unit = await bootUnit({storage: {lastLatitude: HOME.lat, lastLongitude: HOME.lon}});
        await settle(unit);
        const gps = unit.props.sensors.in.gps;
        expect(gps.solution.altitudeAided).toBe(true); // Preconditions
        const used: number[] = [...(gps as any).solutionPrns];
        expect(used.length).toBeGreaterThanOrEqual(7);
        const sdk = gps.gpsSatComputer.getSatellites();
        const fakes = used.slice(0, 4);
        const held = used.slice(0, used.length - 3);
        vi.spyOn(gps.fakeReceiver, 'claimsSdkPrn').mockImplementation(prn => held.includes(prn));
        vi.spyOn(gps.fakeReceiver, 'inUsePrns').mockReturnValue(fakes);
        vi.spyOn(gps.fakeReceiver, 'fakeZenith').mockImplementation(prn => sdk.find(x => x.prn === prn)!.position.get()[0]);
        vi.spyOn(gps.fakeReceiver, 'fakeHourAngle').mockImplementation(prn => sdk.find(x => x.prn === prn)!.position.get()[1]);
        await untilCalcTick(unit);

        expect([...(gps as any).solutionPrns]).toEqual([...used.slice(used.length - 3), ...fakes]); // Preconditions
        expect(gps.solution.measurements).toBe(8);
        expect(gps.rangeErrors.falseReference).toBe(true);
        // The faulty satellite is picked and counted on the real rows alone (ReceiverView.solutionPrns)
        expect([...(gps as any).realSolutionPrns]).toEqual(used.slice(used.length - 3));
    }, 60_000);

    // A receiver failure blocks every signal (IM C-7): no fake signal reaches a dead antenna either
    it.each(['gpsAntenna', 'gpsReceiver'] as const)('a %s failure takes the fake satellites, their claims and their rows in the same tick', async key => {
        const {unit} = await captured(spoofer(0, 0), NO_ALTIMETER);
        const gps = unit.props.sensors.in.gps;

        unit.props.failures.fail(key);
        await untilCalcTick(unit);

        expect(gps.solution.satellites).toBe(0);
        expect(gps.isValid()).toBe(false);
        expect(gps.fakeReceiver.inUsePrns()).toEqual([]);
        expect(gps.channelRows().filter(r => r.fake)).toEqual([]);
        expect(Array.from({length: 32}, (_, i) => i + 1).filter(prn => gps.fakeReceiver.claimsSdkPrn(prn))).toEqual([]);

        await vi.advanceTimersByTimeAsync(60_000);
        expect(gps.channelRows().filter(r => r.fake)).toEqual([]); // Not claimed again while the receiver has failed
        expect(unit.errors).toEqual([]);
    }, 60_000);
});
