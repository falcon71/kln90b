import {vi} from 'vitest';
import {GPSSatelliteState} from '@microsoft/msfs-sdk';
import {HeadlessUnit} from './boot';

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
