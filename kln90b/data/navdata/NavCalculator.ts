import {CalcTickable, TICK_TIME_CALC} from "../../TickController";
import {Sensors} from "../../Sensors";
import {FROM, TO, VolatileMemory} from "../VolatileMemory";
import {FlightPathUtils, GeoCircle, GeoPoint, LatLonInterface, NavMath, UnitType, UserSetting} from "@microsoft/msfs-sdk";
import {KLN90BUserSettings} from "../../settings/KLN90BUserSettings";
import {Degrees, NauticalMiles, Seconds} from "../Units";
import {ModeController} from "../../services/ModeController";
import {KLNFixType, KLNFlightplanLeg} from "../flightplan/Flightplan";
import {KLNMagvar} from "./KLNMagvar";
import {calcDistToDestination} from "../../services/FlightplanUtils";
import {KLN90PlaneSettings} from "../../settings/KLN90BPlaneSettings";
import {bankeAngleForStandardTurn, distanceToAchieveBankAngleChange} from "../../services/KLNNavmath";
import {FromLeg, TurnBisector, TurnPlan, TurnStackEntry} from "../flightplan/ActiveWaypoint";
import {alongTrackDistance, bisectorSide, segmentDistance, turnLead} from "./SequencingGeometry";


//4-8
const WPT_ALERT_WITH_TURN_ANTI = 20;
const WPT_ALERT_WITHOUT_TURN_ANTI = 36;
//#372: a waypoint without a turn while turn anticipation is enabled. Checked in the KLN 89 trainer, 2026-10-14; the
//guide gives 36 s for a Direct To (3-29) without this distinction
const WPT_ALERT_NO_TURN_WITH_TURN_ANTI = 15;

export const HOURS_TO_SECONDS = 3600;

const VEC3_CACHE = new Float64Array(3);
const TO_GEOPOINT_CACHE = new GeoPoint(0, 0);
const ARC_FROM_CACHE = new GeoPoint(0, 0);
const ARC_TO_CACHE = new GeoPoint(0, 0);

export const MAX_BANK_ANGLE = 25;

/**
 * The cross track to a leg beyond which the aircraft counts as off the leg (checked in the KLN 89 trainer, 2026-10-20:
 * the unit compares |XTK| to the active leg against a fixed 4.0 NM at both speeds)
 */
export const OFF_LEG_XTK: NauticalMiles = 4.0;

/**
 * The unit decides where an anticipated turn starts (ActiveWaypoint.turnPlan) this long before the turn point, at the
 * ground speed: where the waypoint alert of a turn flown on course is due (4-8). Checked in the KLN 89 trainer, 2026-10-20:
 * the moment is known to a few seconds
 */
export const TURN_DECISION_TIME: Seconds = WPT_ALERT_WITH_TURN_ANTI;

/**
 * Up to this cross track to the leg at the decision the turn starts at the lead (TurnPlan.AT_LEAD), beyond it at the
 * abeam line (TurnPlan.AT_ABEAM). Checked in the KLN 89 trainer, 2026-10-20, with medium confidence: the gate lies
 * between 2.69 and 2.93 NM, the same at 119 and 239 kt
 */
export const TURN_PLAN_MAX_XTK: NauticalMiles = 2.8;

/**
 * On the abeam plan the waypoint alert starts this long before the abeam line, at the along-track closure rate, and not
 * at the decision (checked in the KLN 89 trainer, 2026-10-20: 14 to 16 s)
 */
export const WPT_ALERT_ABEAM_TURN: Seconds = 15;

/**
 * Off the leg (more than OFF_LEG_XTK from it) the waypoint alert starts this long before the abeam line, at the
 * along-track closure rate, on the outside of the turn (checked in the KLN 89 trainer, 2026-10-20: 37 to 39 s before
 * the sequencing, the same as the alert with turn anticipation off, 4-9). There is none on the inside, where the
 * sequencing comes at the inside bisector
 */
export const WPT_ALERT_OFF_LEG: Seconds = 36;


/**
 * This class updates all navigation variables
 */
export class NavCalculator implements CalcTickable {
    private readonly turnAnticipation: UserSetting<boolean>;

    private lastTurnStackDistance: NauticalMiles | null = null;


    constructor(private readonly sensors: Sensors, private readonly memory: VolatileMemory, private readonly magvar: KLNMagvar, userSettings: KLN90BUserSettings, private readonly modeController: ModeController, private readonly planeSettings: KLN90PlaneSettings) {
        this.turnAnticipation = userSettings.getSetting("turnAnticipation");
    }


    tick(): void {
        const nav = this.memory.navPage;
        if (nav.isSelfTestActive) {
            nav.xtkToActive = -2.5;
            nav.steeringPath = null;
            nav.distToActive = 34.5;
            nav.desiredTrack = this.magvar.magToTrue(315);
            nav.eteToActive = null;
            nav.distToDest = null;
            nav.eteToDest = null;
            nav.bearingToActive = this.magvar.magToTrue(130);
            nav.bearingForAP = this.magvar.magToTrue(130);
            nav.toFrom = FROM;
            nav.waypointAlert = true;
            nav.xtkScale = 5;
            nav.activeWaypoint.clearTurnStack();
            this.setOutput();
            return;
        } else if (!this.sensors.in.gps.isValid()) {
            this.setFlag();
            this.setOutput();
            return;
        }

        let toLeg = nav.activeWaypoint.getActiveLeg();

        if (toLeg === null) {
            toLeg = nav.activeWaypoint.activateFpl0();
        }


        if (toLeg === null) {
            this.setFlag();
            this.setOutput();
            return;
        }

        const fromLeg = nav.activeWaypoint.getFromLeg()!;

        //6-18 Always direct distance, even for arcs
        nav.distToActive = UnitType.GA_RADIAN.convertTo(this.sensors.in.gps.coords.distance(toLeg.wpt), UnitType.NMILE);

        const futureLegs = nav.activeWaypoint.getFutureLegs();
        nav.distToDest = calcDistToDestination(nav, futureLegs);

        nav.bearingToActive = this.sensors.in.gps.coords.bearingTo(toLeg.wpt);

        let dtk: Degrees;

        //ETE
        if (this.sensors.in.gps.groundspeed > 2) {
            nav.eteToActive = nav.distToActive / this.sensors.in.gps.groundspeed * HOURS_TO_SECONDS;
            nav.eteToDest = nav.distToDest !== null ? nav.distToDest / this.sensors.in.gps.groundspeed * HOURS_TO_SECONDS : null; //#393: 0 is a value
        } else {
            nav.eteToActive = null;
            nav.eteToDest = null;
            nav.waypointAlert = false;
        }

        let legPath = fromLeg.path;
        if (!this.modeController.isObsModeActive() && isNaN(fromLeg.path.center[0])) { //Happens when FROM and TO are the same waypoint
            const idx = nav.activeWaypoint.getActiveFplIdx();
            nav.activeWaypoint.sequenceToNextWaypoint();
            if (nav.activeWaypoint.getActiveFplIdx() !== idx) {
                console.warn("invalid path, sequencing to the next waypoint", fromLeg);
                return;
            }
            //#120: the last leg has no length. The unit keeps navigating on the course of the leg before it (checked in
            //the KLN 89 trainer, 2026-10-14); without a leg before, only distance, bearing and ETE remain
            const incoming = this.getIncomingPath(idx);
            if (incoming === null) {
                nav.xtkToActive = null;
                nav.steeringPath = null;
                nav.desiredTrack = null;
                nav.toFrom = null;
                nav.bearingForAP = nav.bearingToActive;
                nav.waypointAlert = false;
                this.setOutput();
                return;
            }
            legPath = incoming;
        }

        //The distance flown in one calculation tick
        const tickDistance = this.sensors.in.gps.groundspeed / HOURS_TO_SECONDS / 1000 * TICK_TIME_CALC;

        //Special handling for turns
        if (nav.activeWaypoint.turnStack.length > 0) {
            const turnStackEntry = nav.activeWaypoint.turnStack[nav.activeWaypoint.turnStack.length - 1];
            const distFromCurrent = UnitType.GA_RADIAN.convertTo(this.sensors.in.gps.coords.distance(turnStackEntry.switchPoint), UnitType.NMILE);
            //The abeam turn has no end of its own: it ends with its waypoint (ActiveWaypoint.setActiveIdx)
            if (turnStackEntry.abeamTurnSign === null && (turnStackEntry.turnBisector !== undefined ? this.isPastEndOfTurn(turnStackEntry, turnStackEntry.turnBisector, tickDistance, legPath)
                : distFromCurrent <= tickDistance || distFromCurrent > this.lastTurnStackDistance!)) {
                console.debug("Reached end of turn", distFromCurrent, this.lastTurnStackDistance, nav.activeWaypoint.turnStack);
                //We have reached the end of the turn, XTK will now use the normal leg again
                nav.activeWaypoint.turnStack.pop();
                const nextEntry = nav.activeWaypoint.turnStack[nav.activeWaypoint.turnStack.length - 1];
                if (nextEntry) {
                    this.lastTurnStackDistance = UnitType.GA_RADIAN.convertTo(this.sensors.in.gps.coords.distance(nextEntry.switchPoint), UnitType.NMILE);
                } else {
                    this.lastTurnStackDistance = null;
                }
            } else {
                this.lastTurnStackDistance = distFromCurrent;
            }
        }

        //XTK
        if (nav.activeWaypoint.turnStack.length > 0) {
            //4-8 XTK will be based on a smooth turn
            const turnStackEntry = nav.activeWaypoint.turnStack[nav.activeWaypoint.turnStack.length - 1];
            nav.xtkToActive = turnStackEntry.abeamTurnSign !== null ? turnStackEntry.abeamTurnSign * nav.distToActive
                : UnitType.GA_RADIAN.convertTo(turnStackEntry.path.distance(this.sensors.in.gps.coords), UnitType.NMILE);
        } else {
            nav.xtkToActive = UnitType.GA_RADIAN.convertTo(legPath.distance(this.sensors.in.gps.coords), UnitType.NMILE);
        }


        //DTK
        if (this.modeController.isObsModeActive()) {
            nav.desiredTrack = null;
            nav.bearingForAP = nav.bearingToActive;
            dtk = this.modeController.getObsTrue();
        } else {
            //XTK will be switched to the next XTK right at the start of the turn, even if the active waypoint has not been switched yet
            const pathForDtk = nav.activeWaypoint.turnStack.length > 0 ? nav.activeWaypoint.turnStack[nav.activeWaypoint.turnStack.length - 1].pathForDtk : legPath;

            dtk = pathForDtk.bearingAt(pathForDtk.closest(this.sensors.in.gps.coords, VEC3_CACHE));
            nav.desiredTrack = dtk;

            if (legPath.isGreatCircle()) {
                nav.bearingForAP = nav.bearingToActive;
            } else {
                //The autopilot does not play well with DME arcs, when DTK and bearing to does not match.
                nav.bearingForAP = dtk;
            }

        }


        nav.toFrom = Math.abs(NavMath.diffAngle(nav.bearingToActive, dtk)) <= 90;

        //waypoint sequencing
        if (this.modeController.isObsModeActive()) {
            //5-35: no sequencing in OBS mode; the alert as for a waypoint without a turn (#147, checked in the KLN 89
            //trainer, 2026-10-14)
            nav.waypointAlert = this.sensors.in.gps.groundspeed > 2 && this.isAlertWithoutTurn();
        } else if (this.sensors.in.gps.groundspeed > 2) {
            TO_GEOPOINT_CACHE.set(toLeg.wpt);
            const followingLeg = nav.activeWaypoint.getFollowingLeg();

            if (this.turnAnticipation.get()
                && followingLeg !== null
                && toLeg.flyOver !== true
                && !TO_GEOPOINT_CACHE.equals(followingLeg.wpt))  //Based on the KLN 89 trainer, it will overfly the waypoint, if it is duplicated
            {
                const desiredBankAngle = bankeAngleForStandardTurn(this.sensors.in.gps.groundspeed);
                const fromDtk = fromLeg.path.bearingAt(fromLeg.path.closest(toLeg.wpt, VEC3_CACHE)); //Important for DME arcs, we need the DTK at the end of the arc, not the current one. Also helps for very long GC legs

                let nextDtk: number;
                let nextPath: GeoCircle;
                if (toLeg.arcData === undefined) {
                    nextPath = GeoCircle.createGreatCircle(toLeg.wpt, followingLeg.wpt);
                    nextDtk = nextPath.bearingAt(toLeg.wpt);
                } else {
                    nextPath = toLeg.arcData.circle;
                    nextDtk = toLeg.arcData.circle.bearingAt(toLeg.arcData.entryFacility);
                }
                const turnAngle = Math.abs(NavMath.diffAngle(fromDtk, nextDtk));
                const turnDirection = NavMath.getTurnDirection(fromDtk, nextDtk);
                //#404: the lead is capped at 60 s of ground speed and half the inbound leg, and a capped turn is flown on
                //the tighter circle tangent to both legs (checked in the KLN 89 trainer, 2026-10-20)
                const {lead, radius: turnRadius} = turnLead(this.sensors.in.gps.groundspeed, turnAngle, this.inboundLegLength(fromLeg, toLeg.wpt));
                //The roll-in on top of the lead is a deliberate departure from the trainer, which adds none: the unit
                //calculates at 1 Hz and can start a turn up to a second late, and the sim's autopilot and aircraft need
                //time to roll in. Users reported overshoots before it was added, and the default autopilot follows the GPS
                //SimVars, so the displayed and the commanded turn start cannot be split
                const turnPoint = lead + distanceToAchieveBankAngleChange(desiredBankAngle, this.sensors.in.gps.groundspeed);
                //The turn starts at an along-track distance, measured along the inbound leg: on course it is the straight
                //distance, off course it is not (checked in the KLN 89 trainer, 2026-10-20)
                const along = alongTrackDistance(legPath, toLeg.wpt, this.sensors.in.gps.coords);
                const activeWaypoint = nav.activeWaypoint;
                //#157: the cross track to the active leg's own path, not to a turn circle, decides every calculation
                //whether the aircraft is on the leg or off it (checked in the KLN 89 trainer, 2026-10-20: not latched)
                const legXtk = UnitType.GA_RADIAN.convertTo(legPath.distance(this.sensors.in.gps.coords), UnitType.NMILE);
                this.decideTurnPlan(Math.abs(legXtk), along, turnPoint);

                if (Math.abs(legXtk) > OFF_LEG_XTK) {
                    this.tickOffLeg(fromLeg, toLeg, followingLeg, legPath, legXtk, along, turnDirection);
                } else {
                    //On the leg (the design, docs/superpowers/specs/2026-10-20-waypoint-sequencing-design.md, section 3.3)
                    //We have reached the start of the turn but not the waypoint yet. XTK will now follow a curved path and DTK will indicate the next path
                    //#404: also when the leg became active with the aircraft already inside the lead (a Direct To, a short
                    //leg): the turn is started at once and flown, the waypoint is not skipped (checked in the KLN 89 trainer,
                    //2026-10-20; this replaces the skip of #76)
                    //#375: the waypoint's own turn is started once. A turn that ended while the waypoint is still active is
                    //not started again, which flipped the DTK between the legs every tick. #157: a turn dropped off the leg
                    //(tickOffLeg) is the exception: it starts again by the kept plan once the aircraft is back on the leg
                    //(the design, section 3.2)
                    //The waypoint's own turn supersedes a turn left over from the previous waypoint once its turn point is
                    //reached by the plan: the leftover entries are dropped (ActiveWaypoint.startOwnTurn). Waiting for the
                    //leftover to end delayed the turn, and the sequencing at the bisector that the turn arms, whenever the
                    //previous turn's lead reached past this turn point: on a leg shorter than that lead the waypoint was
                    //sequenced past it, its turn flown from behind. No trainer evidence; the final review of the waypoint
                    //sequencing, 2026-10-21
                    if (toLeg.fixType !== KLNFixType.MAP && !activeWaypoint.ownTurnStarted) {
                        if (activeWaypoint.turnPlan === TurnPlan.AT_LEAD
                            && along <= turnPoint + tickDistance) { //Distance is within the next tick, we rather start the turn a little too early than too late
                            const fromPath = new GeoCircle(fromLeg.path.center, fromLeg.path.radius);

                            //4-8 We save information on how this turn was calculated
                            const startOfTurn = new GeoPoint(toLeg.wpt.lat, toLeg.wpt.lon);
                            startOfTurn.offset(NavMath.reciprocateHeading(fromDtk), UnitType.NMILE.convertTo(lead, UnitType.GA_RADIAN));

                            const turnCircle = this.calculateTurnCircle(turnRadius, startOfTurn, fromDtk, turnDirection);
                            const endOfTurn = new GeoPoint(toLeg.wpt.lat, toLeg.wpt.lon);
                            endOfTurn.offset(nextDtk, UnitType.NMILE.convertTo(lead, UnitType.GA_RADIAN));
                            //Since we add a few seconds before the turn to reach the desired bank angle, we need to keep the old path for a short moment
                            this.lastTurnStackDistance = UnitType.GA_RADIAN.convertTo(this.sensors.in.gps.coords.distance(startOfTurn), UnitType.NMILE);
                            activeWaypoint.startOwnTurn(
                                new TurnStackEntry(turnCircle, endOfTurn, nextPath, {wpt: new GeoPoint(toLeg.wpt.lat, toLeg.wpt.lon), inboundDtk: fromDtk, nextDtk: nextDtk}),
                                new TurnStackEntry(fromPath, startOfTurn, nextPath));
                            console.log("turn: moving to next wpt", toLeg.wpt, activeWaypoint.getActiveWpt(), along, turnPoint);
                        } else if (activeWaypoint.turnPlan === TurnPlan.AT_ABEAM && nav.toFrom === FROM) {
                            //The abeam turn reproduces the real unit: on the abeam plan the turn starts at the abeam line as a
                            //turn of no size at the waypoint, XTK is the distance to the waypoint with the sign of the side the
                            //turn goes to, and DTK is the next leg's, until the bisector (line 2 equal to the distance for 35 to
                            //115 s, checked in the KLN 89 trainer, 2026-10-20). It only happens when a waypoint is passed up to
                            //4 NM off course, in practice when hand flying; a default autopilot coupled at that moment steers
                            //back toward the waypoint until the bisector. Roll steering steers on the next leg at once, because
                            //the aircraft is farther from a circle of no size than its radius (steeringPath)
                            activeWaypoint.startOwnTurn(TurnStackEntry.abeamTurn(toLeg.wpt, nextPath, turnDirection));
                            console.log("abeam turn: moving to next wpt", toLeg.wpt, activeWaypoint.getActiveWpt());
                        }
                    }

                    nav.waypointAlert = this.isAlertWithTurn(legPath, along); //Arrow flashes until end of turn and the light remains on until end of turn: https://youtu.be/S1lt2W95bLA?si=C45kt8pik15Iodoy&t=2245

                    //#375: sequenced where the aircraft crosses the bisector of the turn, the line through the waypoint that
                    //halves the angle between the legs: on course the middle of the turn, for a big turn well before the
                    //waypoint (3.2 NM for 171° at 239 kt, checked in the KLN 89 trainer, 2026-10-20). The test is a state,
                    //armed once the waypoint's own turn has started or on the abeam plan, so an aircraft already past the line
                    //then sequences at once. On the inside of a turn on the abeam plan that can be before the abeam line,
                    //where no turn has started (the design, section 3.3, the maintainer's lead's call; not observed in the
                    //trainer). It does not read the waypoint alert: a turn still on the stack from the previous waypoint keeps
                    //the alert on, and the abeam test that read it sequenced a waypoint 13 NM away
                    if (toLeg.fixType !== KLNFixType.MAP //don't move missed approach waypoint!
                        && (activeWaypoint.ownTurnStarted || activeWaypoint.turnPlan === TurnPlan.AT_ABEAM)
                        && bisectorSide(toLeg.wpt, fromDtk, nextDtk, this.sensors.in.gps.coords) >= 0) {
                        activeWaypoint.sequenceToNextWaypoint();
                        console.log("moving to next wpt", toLeg.wpt, activeWaypoint.getActiveWpt());
                    }
                }

            } else {
                nav.waypointAlert = this.isAlertWithoutTurn();
                if (toLeg.fixType !== KLNFixType.MAP && nav.toFrom === FROM) {
                    nav.activeWaypoint.sequenceToNextWaypoint();
                    console.log("moving to next wpt", toLeg.wpt, nav.activeWaypoint.getActiveWpt());
                }
            }
        } else {
            nav.waypointAlert = false;
        }

        //#373, #100: the path roll steering follows, taken after the sequencing of this tick (which may have changed the
        //leg), so that a turn pushed in this tick is steered in this tick
        nav.steeringPath = this.steeringPath(this.activeLegPath() ?? legPath);

        this.setOutput();
    }

    /**
     * The path of the active leg as tick() takes it at its start: the path of the from leg, or past a leg without length
     * the leg before it (#120). Null without a leg, or without a leg before one without length
     */
    private activeLegPath(): GeoCircle | null {
        const activeWaypoint = this.memory.navPage.activeWaypoint;
        const fromLeg = activeWaypoint.getFromLeg();
        if (fromLeg === null) {
            return null;
        }
        if (!this.modeController.isObsModeActive() && isNaN(fromLeg.path.center[0])) {
            return this.getIncomingPath(activeWaypoint.getActiveFplIdx());
        }
        return fromLeg.path;
    }

    /**
     * The path roll steering follows (the roll steering design, docs/superpowers/specs/2026-10-19-roll-steering-design.md,
     * section 4A). Without a turn it is the leg path. During a turn, including the lead-in before it, it is the turn
     * circle (turnStack[0]), so that the bank is established when the circle begins. More than one radius from the circle
     * the turn is no path to follow: beyond its center the closest point lies on the far side, where the circle runs
     * backward, and farther outside the circle steering back to it is a detour. The aircraft then steers on the next leg
     * (pathForDtk) until the turn ends
     */
    private steeringPath(legPath: GeoCircle): GeoCircle {
        const turnStack = this.memory.navPage.activeWaypoint.turnStack;
        if (turnStack.length === 0) {
            return legPath;
        }
        const turn = turnStack[0];
        if (Math.abs(turn.path.distance(this.sensors.in.gps.coords)) > FlightPathUtils.getTurnRadiusFromCircle(turn.path)) {
            turn.steerOnPathForDtk = true;
        }
        return turn.steerOnPathForDtk ? turn.pathForDtk : turn.path;
    }

    /**
     * The waypoint alert for a waypoint without a turn to anticipate: no following leg, a fly-over, a waypoint followed by
     * a copy of itself, or turn anticipation off. It ends once the waypoint is passed (#372). The turn onto the last leg
     * is still being flown after the sequencing, so the alert stays on until it ends (#156)
     */
    private isAlertWithoutTurn(): boolean {
        const nav = this.memory.navPage;
        const alertTime = this.turnAnticipation.get() ? WPT_ALERT_NO_TURN_WITH_TURN_ANTI : WPT_ALERT_WITHOUT_TURN_ANTI;
        return (nav.toFrom === TO && nav.eteToActive! <= alertTime) || nav.activeWaypoint.turnStack.length > 0;
    }

    /**
     * Decides once where the anticipated turn of the active waypoint starts, at the first calculation with the aircraft
     * at most TURN_DECISION_TIME of ground speed before the turn point along the track: at the lead (TurnPlan.AT_LEAD)
     * with at most TURN_PLAN_MAX_XTK of cross track to the leg then, otherwise at the abeam line (TurnPlan.AT_ABEAM). The
     * decision is latched until the active waypoint changes (ActiveWaypoint.clearTurnState): in the KLN 89 trainer,
     * 2026-10-20, the cross track fell to 0.7 to 0.9 NM after the decision and the unit still waited for the abeam line.
     * The gate (2.8 NM, between 2.69 and 2.93 in the trainer) and the moment of the decision are known with medium
     * confidence. A leg that becomes active past the decision point (a Direct To, a power-up) is decided at once.
     * #157: the decision is also taken off the leg (more than OFF_LEG_XTK from it), which is then always AT_ABEAM, so that
     * an aircraft that comes back on the leg past the decision point turns at the abeam line (the trainer's R2 and R6)
     * @param legXtk the absolute cross track to the active leg
     * @param along the along-track distance to the active waypoint
     * @param turnPoint the along-track distance at which the turn of the turn plan starts
     */
    private decideTurnPlan(legXtk: NauticalMiles, along: NauticalMiles, turnPoint: NauticalMiles): void {
        const activeWaypoint = this.memory.navPage.activeWaypoint;
        if (activeWaypoint.turnPlan !== null
            || along > turnPoint + this.sensors.in.gps.groundspeed * TURN_DECISION_TIME / HOURS_TO_SECONDS) {
            return;
        }
        activeWaypoint.turnPlan = legXtk <= TURN_PLAN_MAX_XTK ? TurnPlan.AT_LEAD : TurnPlan.AT_ABEAM;
    }

    /**
     * #157: off the leg, more than OFF_LEG_XTK from it, the active waypoint has no anticipated turn and no turn path
     * (checked in the KLN 89 trainer, 2026-10-20, the runs E, F and R1 to R8; the design, sections 3.2 and 3.4). A turn
     * of its own that has started is dropped, so XTK and DTK fall back to the leg; a turn left over from the previous
     * waypoint runs to its end. The waypoint is sequenced as soon as the next leg's segment is at least as close as the
     * active leg's (segmentDistance, the measure of ActiveWaypoint.findClosestLegIdx): on the outside of the turn at the
     * abeam line, on the inside at the inside bisector, however far from the waypoint (11 NM in R7). Whether a tie
     * sequences cannot be told at 1 Hz. The alert starts WPT_ALERT_OFF_LEG before the abeam line on the outside and stays
     * off on the inside (the trainer gave none in R7 and R8), and a leftover turn keeps it on (#156)
     * @param fromLeg the start of the active leg, for a Direct To where it was activated
     * @param toLeg the active waypoint
     * @param followingLeg the leg after it
     * @param legPath the path of the active leg
     * @param legXtk the cross track to the active leg, positive on its right
     * @param along the along-track distance to the active waypoint
     * @param turnDirection the direction of the turn at the active waypoint
     */
    private tickOffLeg(fromLeg: FromLeg, toLeg: KLNFlightplanLeg, followingLeg: KLNFlightplanLeg, legPath: GeoCircle, legXtk: NauticalMiles,
                       along: NauticalMiles, turnDirection: "left" | "right"): void {
        const activeWaypoint = this.memory.navPage.activeWaypoint;
        if (activeWaypoint.ownTurnStarted) {
            activeWaypoint.dropOwnTurn();
            //No roll-in distance is left to follow. A circle on top of the stack was normally popped first, earlier in this
            //calculation, by the 4.0 NM end in isPastEndOfTurn
            this.lastTurnStackDistance = null;
        }

        //The outside of the turn is the side away from it: the right of the leg for a left turn
        const outside = turnDirection === "left" ? legXtk > 0 : legXtk < 0;
        this.memory.navPage.waypointAlert = activeWaypoint.turnStack.length > 0
            || (outside && this.isWithinTimeOfAbeam(legPath, along, WPT_ALERT_OFF_LEG));

        if (toLeg.fixType === KLNFixType.MAP) { //don't move missed approach waypoint!
            return;
        }
        const pos = this.sensors.in.gps.coords;
        const activeDistance = segmentDistance(fromLeg.wpt, toLeg.wpt, fromLeg.path.isGreatCircle() ? undefined : fromLeg.path, pos);
        const nextDistance = segmentDistance(toLeg.wpt, followingLeg.wpt, toLeg.arcData?.circle, pos);
        if (nextDistance <= activeDistance) {
            activeWaypoint.sequenceToNextWaypoint();
            console.log("off the leg: moving to next wpt", toLeg.wpt, activeWaypoint.getActiveWpt());
        }
    }

    /**
     * Whether the aircraft will cross the abeam line of the active waypoint within the time, at the closure rate along
     * the leg: the ground speed times the cosine of the angle between the track and the leg. False while the aircraft
     * does not close on the line, and once it is past the line: there the waypoint is sequenced off the leg on the
     * outside, and the abeam turn is on the stack on the abeam plan, but at the MAP neither happens, and the alert would
     * otherwise stay on through the whole missed approach (#157)
     * @param legPath the path of the active leg
     * @param along the along-track distance to the active waypoint
     * @param time
     */
    private isWithinTimeOfAbeam(legPath: GeoCircle, along: NauticalMiles, time: Seconds): boolean {
        const track = this.sensors.in.gps.getTrackTrueRespectingGroundspeed();
        if (track === null || along < 0) {
            return false;
        }
        const legDtk = legPath.bearingAt(legPath.closest(this.sensors.in.gps.coords, VEC3_CACHE));
        const closure = this.sensors.in.gps.groundspeed * Math.cos(UnitType.DEGREE.convertTo(NavMath.diffAngle(legDtk, track), UnitType.RADIAN)) / HOURS_TO_SECONDS;
        return closure > 0 && along / closure <= time;
    }

    /**
     * The waypoint alert of a waypoint with a turn to anticipate (4-8). On the turn plan it starts at the decision, about
     * 20 s before the turn starts, and holds while the aircraft is TO the waypoint: without a turn (at the MAP, or when
     * the aircraft turned away before the turn point) it ends once the waypoint is behind, as before the plan. On the
     * abeam plan it starts WPT_ALERT_ABEAM_TURN before the abeam line, at the closure
     * rate along the leg, and not while the aircraft does not close on the line (checked in the KLN 89 trainer,
     * 2026-10-20). It stays on while a turn is flown, also a turn of the previous waypoint (#156)
     * @param legPath the path of the active leg
     * @param along the along-track distance to the active waypoint
     */
    private isAlertWithTurn(legPath: GeoCircle, along: NauticalMiles): boolean {
        const activeWaypoint = this.memory.navPage.activeWaypoint;
        if (activeWaypoint.turnStack.length > 0) {
            return true;
        }
        if (activeWaypoint.turnPlan === TurnPlan.AT_LEAD) {
            return this.memory.navPage.toFrom === TO;
        }
        return activeWaypoint.turnPlan === TurnPlan.AT_ABEAM && this.isWithinTimeOfAbeam(legPath, along, WPT_ALERT_ABEAM_TURN);
    }

    /**
     * #404: the turn circle ends once the aircraft is past its end point along the next leg (within the tick ahead), but
     * only past its midpoint: on the next leg's side of the turn's bisector and with the track within 90° of the next
     * leg. Near 180° the start of the turn lies barely before its end point along the next leg (lead · (1 + cos θ)), so
     * the end point alone would end the turn where it starts; short of 180° the aircraft is still on the inbound side of
     * the bisector there. At 180° the start is the end point and the bisector runs along both legs, so in the first
     * calculations of the circle the aircraft is at the end point, within the tick ahead, and not on the inbound side of
     * the bisector: only the track, still the inbound course and opposite the next leg, shows that the turn has not been
     * flown (turnLead.test.ts, the 180° turn). After that the aircraft moves away from the end point along the next leg
     * until the turn is nearly complete. A capped turn is tighter than the aircraft can fly, so the aircraft moves away
     * from the end point at first: the distance to it, which ends the roll-in, would end the turn as soon as it began.
     * The turn also ends when the aircraft is more than OFF_LEG_XTK from the active leg: the inbound leg until the
     * waypoint is sequenced, the next leg afterwards (the spec's section 3.2; for the waypoint's own turn tickOffLeg
     * drops the rest of it in the same calculation). Measured to the next leg instead, a fast
     * aircraft would be off it at the start of the turn already (lead · sin θ)
     * @param entry the turn circle
     * @param bisector its turnBisector
     * @param tickDistance the distance flown in one calculation tick
     * @param activeLegPath the path of the active leg
     */
    private isPastEndOfTurn(entry: TurnStackEntry, bisector: TurnBisector, tickDistance: NauticalMiles, activeLegPath: GeoCircle): boolean {
        const pos = this.sensors.in.gps.coords;
        if (Math.abs(UnitType.GA_RADIAN.convertTo(activeLegPath.distance(pos), UnitType.NMILE)) > OFF_LEG_XTK) {
            return true;
        }
        const track = this.sensors.in.gps.getTrackTrueRespectingGroundspeed();
        if (track === null || bisectorSide(bisector.wpt, bisector.inboundDtk, bisector.nextDtk, pos) < 0) {
            return false;
        }
        const nextDtk = entry.pathForDtk.bearingAt(entry.pathForDtk.closest(pos, VEC3_CACHE));
        return Math.abs(NavMath.diffAngle(track, nextDtk)) < 90
            && alongTrackDistance(entry.pathForDtk, entry.switchPoint, pos) <= tickDistance;
    }

    /**
     * #404: the length of the leg flown into the waypoint, for the cap of the lead at half of it: the distance between
     * the waypoints, or for a DME arc the length along the arc. For a Direct To the leg starts where it was activated
     */
    private inboundLegLength(fromLeg: FromLeg, to: LatLonInterface): NauticalMiles {
        if (fromLeg.path.isGreatCircle()) {
            return UnitType.GA_RADIAN.convertTo(GeoPoint.distance(fromLeg.wpt, to), UnitType.NMILE);
        }
        fromLeg.path.closest(fromLeg.wpt, ARC_FROM_CACHE);
        fromLeg.path.closest(to, ARC_TO_CACHE);
        return UnitType.GA_RADIAN.convertTo(fromLeg.path.distanceAlong(ARC_FROM_CACHE, ARC_TO_CACHE, Math.PI), UnitType.NMILE);
    }

    /**
     * #120: the path of the FPL 0 leg that ends where the zero-length leg at idx starts, null if there is none or it has
     * no length either
     */
    private getIncomingPath(idx: number): GeoCircle | null {
        if (idx < 2) {
            return null;
        }
        const legs = this.memory.navPage.activeWaypoint.fpl0.getLegs();
        const from = legs[idx - 2];
        const to = legs[idx - 1];
        const path = from.arcData === undefined ? GeoCircle.createGreatCircle(from.wpt, to.wpt) : from.arcData.circle;
        return isNaN(path.center[0]) ? null : path;
    }

    /**
     * 4-8 XTK calculations use a smooth path during turns. Here we calculate this path once we start the turn
     * @param turnRadius
     * @param startOfTurn
     * @param fromDtk
     * @param turnDir
     * @private
     */
    private calculateTurnCircle(turnRadius: number, startOfTurn: GeoPoint, fromDtk: number, turnDir: "left" | "right"): GeoCircle {
        //This is the point, where we ideally want to start the turn

        //This is the center point of the turn
        TO_GEOPOINT_CACHE.set(startOfTurn);
        const centerOfTurn = TO_GEOPOINT_CACHE.offset(NavMath.normalizeHeading(fromDtk + 90 * (turnDir === "right" ? 1 : -1)), UnitType.NMILE.convertTo(turnRadius, UnitType.GA_RADIAN));

        //This circle describes the entire turn
        const circleDescribingTurnTowardsLeg = GeoCircle.createFromPoint(centerOfTurn, UnitType.NMILE.convertTo(turnRadius, UnitType.GA_RADIAN));
        if (turnDir == "right") {
            circleDescribingTurnTowardsLeg.reverse();
        }

        return circleDescribingTurnTowardsLeg;
    }

    /**
     * Flags all variables
     * @private
     */
    private setFlag() {
        const nav = this.memory.navPage;
        nav.xtkToActive = null;
        nav.steeringPath = null;
        nav.distToActive = null;
        nav.distToDest = null;
        nav.desiredTrack = null;
        nav.eteToActive = null;
        nav.eteToDest = null;
        nav.bearingToActive = null;
        nav.bearingForAP = null;
        nav.toFrom = null;
        nav.waypointAlert = false;
    }

    private setOutput() {
        const nav = this.memory.navPage;
        const obsOut = this.modeController.getDtkOrObsMagnetic();
        const magvar = this.magvar.getCurrentMagvar();
        const track = this.sensors.in.gps.getTrackTrueRespectingGroundspeed();

        this.sensors.out.setGpsOverriden();
        this.sensors.out.setXTK(nav.xtkToActive, nav.xtkScale);
        this.sensors.out.setToFrom(nav.toFrom);
        this.sensors.out.setObs(obsOut);
        this.sensors.out.setDesiredTrack(obsOut, track, magvar);
        this.sensors.out.setWpBearing(nav.bearingForAP, nav.bearingToActive, magvar);
        this.sensors.out.setDistance(nav.distToActive);
        this.sensors.out.setWPTETE(nav.eteToActive, this.eteToEta(nav.eteToActive));
        this.sensors.out.setDestETE(nav.eteToDest, this.eteToEta(nav.eteToDest));
        this.sensors.out.setPos(this.sensors.in.gps.coords, this.sensors.in.gps.groundspeed, track, magvar, !this.sensors.in.gps.isValid());

        this.sensors.out.setWPIndex(nav.activeWaypoint.getActiveFplIdx(), nav.activeWaypoint.fpl0.getLegs().length);

        this.sensors.out.setPrevWpt(nav.activeWaypoint.getFromWpt());
        this.sensors.out.setNextWpt(nav.activeWaypoint.getActiveWpt());

        this.sensors.out.setMode(nav.navmode, nav.isSelfTestActive, !this.planeSettings.input.externalSwitches.legObsSwitchInstalled);
        this.sensors.out.setWptAlertLight(nav.waypointAlert); //The manual says flashing, but it's steady in this video (left light) https://youtu.be/S1lt2W95bLA?si=C45kt8pik15Iodoy&t=2245
        this.sensors.out.setAnnunTest(nav.isSelfTestActive);
    }

    private eteToEta(ete: Seconds | null): Seconds | null {
        if (ete === null) {
            return null;
        }

        return this.sensors.in.gps.timeZulu.getSecondsSinceMidnight() + ete;
    }
}
