// The track bank and the curved-path bank are adapted from autopilot/lnav/LNavRollSteerComputer.ts
// (getDesiredBankAngleForTrack, adjustDesiredBankAngleForTurn) and the course to steer from
// autopilot/lnav/LNavComputer.ts of the MSFS avionics framework: Copyright (c) Microsoft Corporation, MIT License, with
// the addendum that it is licensed only for usage in Microsoft Flight Simulator.
import {FlightPathUtils, GeoCircle, LatLonInterface, MathUtils, NavMath, UnitType} from "@microsoft/msfs-sdk";
import {Degrees, Knots, Seconds} from "../data/Units";
import {HOURS_TO_SECONDS, MAX_BANK_ANGLE} from "../data/navdata/NavCalculator";
import {dtkAtClosest} from "../data/navdata/SequencingGeometry";

/**
 * The turn direction kept while the track is far off the course to steer, so that a turn once commanded does not
 * reverse (the roll steering design, docs/superpowers/specs/2026-10-19-roll-steering-design.md, section 4B step 6)
 */
export type TurnLatch = 'left' | 'right' | null;

export interface RollSteeringCommand {
    /** Positive left, at most MAX_BANK_ANGLE either way */
    bankAngle: Degrees;
    /** True */
    courseToSteer: Degrees;
    /** The latch for the next calculation */
    latch: TurnLatch;
}

/**
 * The aircraft aims at the point on the path this far ahead: the join of the KLN 89 trainer fits
 * atan(XTK / (GS x 30 s)) at 119 and 239 kt (checked in the KLN 89 trainer, 2026-10-19)
 */
export const LOOK_AHEAD_TIME: Seconds = 30;
/** From far off the intercept builds up to about 45 degrees and does not exceed it (checked in the KLN 89 trainer, 2026-10-19) */
export const MAX_INTERCEPT_ANGLE: Degrees = 45;
/** Degrees of bank per degree of track error: autopilot/lnav/LNavRollSteerComputer.ts, getDesiredBankAngleForTrack */
export const BANK_GAIN = 1.25;
/**
 * Beyond this track error the turn direction is latched (the roll steering design, section 4B step 6, which leaves
 * the value between about 135 and 150 to the builder)
 */
export const TURN_LATCH_ANGLE: Degrees = 150;

/**
 * The roll steering law of the roll steering design, section 4B: one continuous law from the path to the bank. It is
 * a pure function, so the latch comes in and goes out with the command. The ground speed must be positive (the
 * controller gives no command below 5 kt). All angles are true; a positive bank is left.
 * @param path The path the unit navigates on (NavPageState.steeringPath)
 * @param position The aircraft's position
 * @param groundspeed The ground speed
 * @param trackTrue The ground track
 * @param latch The latch of the previous calculation on the same path, null otherwise
 * @param turnCircle Whether the path is the circle of an anticipated turn (turnStack[0] of NavCalculator), not a DME arc
 * or a leg: the command then never banks against the turn
 */
export function rollSteeringCommand(path: GeoCircle, position: LatLonInterface, groundspeed: Knots,
                                    trackTrue: Degrees, latch: TurnLatch, turnCircle = false): RollSteeringCommand {
    // XTK positive right of the path, and the DTK of the path abeam the aircraft, so that a curved path has its local DTK
    const xtk = UnitType.GA_RADIAN.convertTo(path.distance(position), UnitType.NMILE);
    // #433: on the center of a DME arc no point of the path is abeam: the track then counts as the DTK, and the intercept
    // turns toward the arc
    const dtk = dtkAtClosest(path, position) ?? trackTrue;

    // LNavComputer.ts: the course to steer is the DTK less an intercept toward the path. The intercept aims at the point
    // LOOK_AHEAD_TIME ahead on the path, at most MAX_INTERCEPT_ANGLE (the trainer, see the constants)
    const lookAhead = groundspeed * LOOK_AHEAD_TIME / HOURS_TO_SECONDS;
    const intercept = Math.min(MAX_INTERCEPT_ANGLE, Math.atan(Math.abs(xtk) / lookAhead) * Avionics.Utils.RAD2DEG);
    const courseToSteer = NavMath.normalizeHeading(dtk - Math.sign(xtk) * intercept);

    const trackError = NavMath.diffAngle(trackTrue, courseToSteer);
    let turn: 'left' | 'right';
    let nextLatch: TurnLatch = null;
    if (Math.abs(trackError) > TURN_LATCH_ANGLE) {
        // The course to steer is nearly behind: the turn is the shorter way to it when |e| first exceeds the latch angle
        // (the intercept offset already lies in the course to steer), and it is held while e passes through 180 and XTK
        // changes its sign during the turn (the roll steering design, section 4B (amended 2026-10-19): a turn toward the
        // side of the path would turn the long way after a Direct To behind, where the aircraft starts on the path)
        turn = latch ?? (trackError < 0 ? 'left' : 'right');
        nextLatch = turn;
    } else {
        turn = trackError < 0 ? 'left' : 'right';
    }

    // LNavRollSteerComputer.ts getDesiredBankAngleForTrack
    let bankAngle = Math.min(BANK_GAIN * Math.abs(trackError), MAX_BANK_ANGLE) * (turn === 'left' ? 1 : -1);

    // LNavRollSteerComputer.ts adjustDesiredBankAngleForTurn, without its XTK rate controller: the bank a turn circle or a
    // DME arc needs at this ground speed, in full on the path and fading out within one turn radius at MAX_BANK_ANGLE
    if (!path.isGreatCircle()) {
        const radius = UnitType.GA_RADIAN.convertTo(FlightPathUtils.getTurnRadiusFromCircle(path), UnitType.METER);
        const turnBank = NavMath.bankAngle(groundspeed, radius) * (FlightPathUtils.getTurnDirectionFromCircle(path) === 'left' ? 1 : -1);
        const radiusAtMaxBank = UnitType.METER.convertTo(NavMath.turnRadius(groundspeed, MAX_BANK_ANGLE), UnitType.NMILE);
        bankAngle += Math.max(1 - Math.abs(xtk) / radiusAtMaxBank, 0) * turnBank;
    }

    bankAngle = MathUtils.clamp(bankAngle, -MAX_BANK_ANGLE, MAX_BANK_ANGLE);

    // The roll steering design, section 4B (amended 2026-10-19): an aircraft inside an anticipated turn near its start
    // lies inside the circle, and the law would steer it out to the circle first, a bank against the turn (#100). On a turn
    // circle that side is held at 0 instead; the circle then comes to the aircraft as the turn goes on
    if (turnCircle && bankAngle * (FlightPathUtils.getTurnDirectionFromCircle(path) === 'left' ? 1 : -1) < 0) {
        bankAngle = 0;
    }

    return {
        bankAngle,
        courseToSteer,
        latch: nextLatch,
    };
}
