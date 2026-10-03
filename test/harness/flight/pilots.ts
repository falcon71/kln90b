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
