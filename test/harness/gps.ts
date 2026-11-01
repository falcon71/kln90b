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
