import {LVAR_ROLL_COMMAND} from '../../../kln90b/LVars';
import {FakeSim} from '../sim/FakeSim';
import {Aircraft} from './Aircraft';
import {courseDeg, distanceNm, LatLon} from './geo';

export interface PilotContext {
    sim: FakeSim;
    aircraft: Aircraft;
}

/** Commands the aircraft's bank, positive = right. Called at the aircraft's step rate. */
export interface Pilot {
    commandedBank(ctx: PilotContext): number;
}

/**
 * An autopilot coupled to the unit's roll steering output. L:KLN90B_RollCommand is positive to the left
 * (RollSteeringController.desiredBank) and 0 when the unit has no command, which holds the wings level.
 */
export function coupledAutopilot(): Pilot {
    return {commandedBank: ({sim}) => -sim.get(LVAR_ROLL_COMMAND, 'degrees')};
}

/** Bank per NM of GPS WP CROSS TRK, degrees */
const NAV_MODE_XTK_GAIN = 80;
/** Bank per degree of GPS WP TRACK ANGLE ERROR */
const NAV_MODE_TAE_GAIN = 1.2;

/**
 * A stand-in for the sim's autopilot in NAV/GPS mode, which flies on the GPS SimVars the unit writes with
 * Output.WriteGPSSimVars, not on the roll command (#402). A proportional law, bank = k1·XTK + k2·TAE, clamped to 25°:
 * GPS WP CROSS TRK is positive left of the course (Sensors.setXTK writes the unit's XTK negated) and
 * GPS WP TRACK ANGLE ERROR is the DTK less the track, so both are positive when the aircraft must turn right. At 120 kt
 * the gains give an about critically damped capture with a natural frequency of about 0.09 rad/s; flown with the exact
 * strategy on the standard route it overshoots no leg by more than a few meters. Until the unit writes the SimVars they
 * read 0, which holds the wings level.
 */
export function navModeAutopilot(): Pilot {
    return {
        commandedBank: ({sim}) => {
            const xtk = sim.get('GPS WP CROSS TRK', 'nautical miles');
            const tae = sim.get('GPS WP TRACK ANGLE ERROR', 'degrees');
            return Math.max(-25, Math.min(25, NAV_MODE_XTK_GAIN * xtk + NAV_MODE_TAE_GAIN * tae));
        },
    };
}

/** The test sets the bank directly, e.g. to leave the course on purpose. */
export class ManualPilot implements Pilot {
    public bank = 0;

    public commandedBank(): number {
        return this.bank;
    }
}

/** Flies direct to each point in turn, switching at 0.5 NM, independent of the unit. */
export function scriptedPath(points: LatLon[]): Pilot {
    let next = 0;
    return {
        commandedBank: ({aircraft}) => {
            while (next < points.length && distanceNm(aircraft, points[next]) < 0.5) next++;
            if (next >= points.length) return 0;
            const diff = ((courseDeg(aircraft, points[next]) - aircraft.trackTrue + 540) % 360) - 180;
            return Math.max(-25, Math.min(25, 1.25 * diff));
        },
    };
}
