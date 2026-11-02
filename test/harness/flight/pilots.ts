import {LVAR_ROLL_COMMAND} from '../../../kln90b/LVars';
import {FakeSim} from '../sim/FakeSim';
import {Aircraft, AircraftOptions} from './Aircraft';
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

/** The constants of simNavAutopilot, measured for one aircraft */
export interface SimNavAutopilotParams {
    /** How long the autopilot takes to react: it acts on GPS WP CROSS TRK and GPS WP TRACK ANGLE ERROR as they were this long ago, s */
    delayS: number;
    /** Bank per degree of track error to the course to fly, degrees */
    bankPerDeg: number;
    /** The intercept angle per NM of cross track, degrees */
    interceptPerNm: number;
    /** The largest intercept angle, degrees */
    maxInterceptDeg: number;
    /** The largest commanded bank, degrees */
    maxBankDeg: number;
    /** The time constant of a first-order lag on the bank command, s; 0 for none */
    commandLagS: number;
}

/**
 * A model of the sim's default autopilot in NAV/GPS mode, which flies on the GPS SimVars (GPS WP CROSS TRK and
 * GPS WP TRACK ANGLE ERROR), not on the roll command. It flies a course to the DTK plus an intercept angle that grows with
 * the cross track up to a limit, banks in proportion to the track error to that course up to its bank limit, and reacts
 * after a delay. It knows nothing of a turn: when the DTK switches to the next leg at the start of an anticipated turn
 * (4-8), it sees the whole turn as a track error and banks to its limit. The constants come from flights in the sim
 * (AIRCRAFT_PROFILES); the roll rate is the aircraft's (AircraftOptions). The sim computes GPS WP TRACK ANGLE ERROR from
 * GPS WP DESIRED TRACK itself, so this model's TAE input is the DTK less the track (docs/sim-flight-record.md, 2026-11-02).
 * The time is the harness clock (Date.now() under the fake timers)
 */
export function simNavAutopilot(p: SimNavAutopilotParams): Pilot {
    const inputs: { t: number; xtkNm: number; taeDeg: number }[] = [];
    let command = 0;
    let lastT: number | null = null;
    return {
        commandedBank: ({sim}) => {
            const t = Date.now() / 1000;
            inputs.push({t, xtkNm: sim.get('GPS WP CROSS TRK', 'nautical miles'), taeDeg: sim.get('GPS WP TRACK ANGLE ERROR', 'degrees')});
            while (inputs.length > 1 && inputs[1].t <= t - p.delayS) inputs.shift();
            const {xtkNm, taeDeg} = inputs[0];
            // Both are positive when the aircraft must turn right (navModeAutopilot)
            const intercept = Math.max(-p.maxInterceptDeg, Math.min(p.maxInterceptDeg, p.interceptPerNm * xtkNm));
            const target = Math.max(-p.maxBankDeg, Math.min(p.maxBankDeg, p.bankPerDeg * (taeDeg + intercept)));
            const dt = lastT === null ? 0 : t - lastT;
            lastT = t;
            command = p.commandLagS > 0 ? command + (target - command) * Math.min(1, dt / p.commandLagS) : target;
            return command;
        },
    };
}

/** An aircraft with its autopilot as measured in the sim: the harness aircraft's options and the pilot that flies it */
export interface AircraftProfile {
    /** The aircraft and the autopilot mode that was measured */
    name: string;
    aircraftOptions: AircraftOptions;
    pilot: () => Pilot;
}

/**
 * The Black Square Turbine Duke with the sim's default autopilot in NAV mode, GPS as the nav source and the GPS SimVars
 * written (Output.WriteGPSSimVars). Fitted to the three 90° turns of flight A on 2026-11-02 at about 130 kt (with the
 * roll-in) and checked against flight B (without it), docs/sim-flight-record.md: it starts to bank 2 to 3 s after the DTK
 * switch, rolls at about 4°/s to 27° (above its own AUTOPILOT MAX BANK of 25), holds that bank while the cross track to
 * the turn circle grows, rolls out 220 to 310 m inside the next leg and closes on it at about 10°
 */
export const TURBINE_DUKE: AircraftProfile = {
    name: 'Black Square Turbine Duke, default autopilot NAV',
    aircraftOptions: {rollRateDegPerS: 4, maxBankDeg: 27},
    pilot: () => simNavAutopilot({delayS: 2, bankPerDeg: 1, interceptPerNm: 200, maxInterceptDeg: 15, maxBankDeg: 27, commandLagS: 1}),
};

/** Every aircraft measured in the sim so far */
export const AIRCRAFT_PROFILES: AircraftProfile[] = [TURBINE_DUKE];

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
