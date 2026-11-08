import {vi} from 'vitest';
import {GPSSatelliteState} from '@microsoft/msfs-sdk';
import {HeadlessUnit} from './boot';
import {LatLon, pointFrom} from './flight/geo';
import {AntennaAttitude, SatelliteSignals} from '../../kln90b/GpsSignal';
import {SpooferSite, TransmitterSite} from '../../kln90b/failures/Transmitters';

/**
 * Leaves the receiver only the first n satellites the SDK has in use (in PRN order), as a loss of satellites would:
 * every other satellite is inhibited on the satellite computer and on the STA 5 prediction context (which then no
 * longer follows the computer's inhibits). The inhibited satellites leave the solution at the SDK's next position
 * update (every 5 s). Returns the PRNs kept.
 * @throws Error if the SDK has fewer than n satellites in use
 */
export function inhibitAllBut(unit: HeadlessUnit, n: number): number[] {
    const gps = unit.props.sensors.in.gps;
    const kept = gps.gpsSatComputer.getSatellites()
        .filter(sat => sat.state.get() === GPSSatelliteState.InUse || sat.state.get() === GPSSatelliteState.InUseDiffApplied)
        .slice(0, n)
        .map(sat => sat.prn);
    if (kept.length < n) {
        throw new Error(`inhibitAllBut: only ${kept.length} satellites in use, ${n} wanted`);
    }
    for (const sat of gps.gpsSatComputer.getSatellites()) {
        if (!kept.includes(sat.prn)) {
            gps.gpsSatComputer.setSatelliteInhibit(sat.prn, true);
            gps.raimPrediction.setSatelliteInhibit(sat.prn, true);
        }
    }
    return kept;
}

/** Lifts every inhibit of inhibitAllBut; the prediction context follows the computer's inhibits again */
export function liftInhibits(unit: HeadlessUnit): void {
    const gps = unit.props.sensors.in.gps;
    for (const prn of [...gps.gpsSatComputer.inhibitedSatellitePrnCodes.get()]) {
        gps.gpsSatComputer.setSatelliteInhibit(prn, false);
    }
    gps.raimPrediction.syncSatelliteInhibitWithParent();
}

/** Seconds from now until the GPS has a solution, or cap when it has none by then. The time is the subject (test/README.md) */
export async function secondsToFix(unit: HeadlessUnit, cap: number): Promise<number> {
    const gps = unit.props.sensors.in.gps;
    let s = 0;
    for (; s < cap && !gps.isValid(); s++) {
        await vi.advanceTimersByTimeAsync(1000);
    }
    return s;
}

/**
 * Keeps the satellites of inhibitAllBut inhibited through the start model of a power cycle: the search sets the inhibits
 * of every satellite at its start and lifts them at its end (GpsSearch, #62, #468), which would lift the test's too. Every
 * later setSatelliteInhibit of the receiver inhibits a PRN that is not in kept, as a receiver failure's block does
 */
export function holdInhibits(unit: HeadlessUnit, kept: readonly number[]): void {
    const computer = unit.props.sensors.in.gps.gpsSatComputer;
    const original = computer.setSatelliteInhibit.bind(computer);
    vi.spyOn(computer, 'setSatelliteInhibit').mockImplementation((prn: number, inhibit: boolean) => original(prn, inhibit || !kept.includes(prn)));
}

/**
 * A noise rise on every satellite, put into the signals' tick and refresh in place of the receiver's own (#465). For tests of
 * what a loss of signal shows, whatever its cause; the rise was #460's jamming ramp, which #465 replaced by ground
 * transmitters. Call it before the boot: the forced acquisition refreshes the signals. vi.restoreAllMocks removes it
 * @param db The rise in dB at the n-th tick of the signals, counted from 1 over every instance; 0 before the first
 */
export function forceNoiseRise(db: (ticks: number) => number): void {
    const tick = SatelliteSignals.prototype.tick;
    const refresh = SatelliteSignals.prototype.refresh;
    let ticks = 0;
    vi.spyOn(SatelliteSignals.prototype, 'tick').mockImplementation(function (this: SatelliteSignals, t: number, attitude: Readonly<AntennaAttitude>) {
        ticks++;
        tick.call(this, t, attitude, db(ticks));
    });
    vi.spyOn(SatelliteSignals.prototype, 'refresh').mockImplementation(function (this: SatelliteSignals, attitude: Readonly<AntennaAttitude>) {
        refresh.call(this, attitude, db(ticks));
    });
}

/**
 * Flies the aircraft of a render test straight from a point, one position per second of the clock: PLANE LATITUDE and
 * PLANE LONGITUDE on the great circle, GROUND VELOCITY, PLANE ALT ABOVE GROUND and PLANE ALTITUDE (the same: the fixtures'
 * ground is at 0) and SIM ON GROUND false. A test may give a ground speed far above the aircraft's to cover a long way in
 * few calculation ticks; the receiver reads the positions, not the speed (#465)
 * @returns The last point flown to
 */
export async function flyStraight(unit: HeadlessUnit, from: LatLon, trackTrue: number, groundspeedKt: number, seconds: number, aglFt: number): Promise<LatLon> {
    const sim = unit.env.sim;
    sim.set('GROUND VELOCITY', 'knots', groundspeedKt);
    sim.set('PLANE ALT ABOVE GROUND', 'feet', aglFt);
    sim.set('PLANE ALTITUDE', 'feet', aglFt);
    sim.set('SIM ON GROUND', 'bool', false);
    let to = from;
    for (let s = 1; s <= seconds; s++) {
        to = pointFrom(from, trackTrue, groundspeedKt * s / 3600);
        sim.set('PLANE LATITUDE', 'degrees', to.lat);
        sim.set('PLANE LONGITUDE', 'degrees', to.lon);
        await vi.advanceTimersByTimeAsync(1000);
    }
    return to;
}

/** The stored text of an active gpsJamming with this jammer, as an earlier session leaves it (Transmitters, #465) */
export function jammerAt(site: TransmitterSite): Record<string, string> {
    return {failure_gpsJamming: JSON.stringify({lat: site.lat, lon: site.lon, powerDb: site.powerDb, refAglFt: site.refAglFt})};
}

/** The stored text of an active gpsSpoofing with this spoofer, as an earlier session leaves it (Transmitters, #465) */
export function spooferAt(site: SpooferSite): Record<string, string> {
    return {
        failure_gpsSpoofing: JSON.stringify({
            lat: site.lat, lon: site.lon, powerDb: site.powerDb, refAglFt: site.refAglFt,
            falseLat: site.falseLat, falseLon: site.falseLon, falseAltFt: site.falseAltFt, shiftMs: site.shiftMs, clockM: site.clockM,
        }),
    };
}
