import {CalcTickable, TICK_TIME_CALC} from "../../TickController";
import {Sensors} from "../../Sensors";
import {FROM, TO, VolatileMemory} from "../VolatileMemory";
import {FlightPathUtils, GeoCircle, GeoPoint, NavMath, UnitType, UserSetting} from "@microsoft/msfs-sdk";
import {KLN90BUserSettings} from "../../settings/KLN90BUserSettings";
import {Degrees, Knots, NauticalMiles, Seconds} from "../Units";
import {ModeController} from "../../services/ModeController";
import {KLNFixType, KLNFlightplanLeg} from "../flightplan/Flightplan";
import {KLNMagvar} from "./KLNMagvar";
import {calcDistToDestination} from "../../services/FlightplanUtils";
import {KLN90PlaneSettings} from "../../settings/KLN90BPlaneSettings";
import {bankeAngleForStandardTurn, distanceToAchieveBankAngleChange} from "../../services/KLNNavmath";
import {FromLeg, TurnBisector, TurnPlan, TurnStackEntry} from "../flightplan/ActiveWaypoint";
import {courseAtWaypoint} from "./ObsGeometry";
import {bearingBetween} from "./Bearing";
import {alongTrackDistance, bisectorSide, dtkAtClosest, inboundLegLength, segmentDistance, turnLead} from "./SequencingGeometry";


//4-8
const WPT_ALERT_WITH_TURN_ANTI = 20;
const WPT_ALERT_WITHOUT_TURN_ANTI = 36;
//#372: a waypoint without a turn while turn anticipation is enabled. Checked in the KLN 89 trainer, 2026-10-14; the
//guide gives 36 s for a Direct To (3-29) without this distinction
const WPT_ALERT_NO_TURN_WITH_TURN_ANTI = 15;

export const HOURS_TO_SECONDS = 3600;

const VEC3_CACHE = new Float64Array(3);
const TO_GEOPOINT_CACHE = new GeoPoint(0, 0);

export const MAX_BANK_ANGLE = 25;

/**
 * The cross track to a leg beyond which the aircraft counts as off the leg (checked in the KLN 89 trainer, 2026-10-20:
 * the unit compares |XTK| to the active leg against a fixed 4.0 NM at both speeds)
 */
export const OFF_LEG_XTK: NauticalMiles = 4.0;

/**
 * #438: the gate of the turn plan grows with the ground speed. Up to this long of it in cross track to the leg the turn
 * starts at the lead (TurnPlan.AT_LEAD), beyond it at the abeam line (TurnPlan.AT_ABEAM). Checked in the KLN 89 trainer,
 * 2026-10-28 and 2026-10-29: lead with 1.30 NM and abeam with 1.48 at 60 kt, lead with 2.7 and abeam with 2.8 at 119 kt,
 * a bracket of 82 to 85 s
 */
export const TURN_PLAN_MAX_XTK_TIME: Seconds = 83;

/**
 * #438: the cap of the turn plan's gate. Checked in the KLN 89 trainer, 2026-10-29: lead with 4.8 and abeam with 5.0 NM
 * at 239 kt. A cap of 5.0 NM with a strict comparison fits as well
 */
export const TURN_PLAN_MAX_XTK: NauticalMiles = 4.9;

/**
 * #438: the floor of the turn plan's gate. It keeps the gate above the 1.0 NM below which the abeam plan becomes the turn
 * plan (the design, docs/superpowers/specs/2026-10-29-turn-plan-decision-design.md, section 3.2), so that below about
 * 43 kt, on the ground included, the plan cannot flip at every check (the design's call)
 */
export const TURN_PLAN_MIN_XTK: NauticalMiles = 1.0;

/**
 * #438: the cross track to the active leg up to which the active waypoint takes the turn plan: TURN_PLAN_MAX_XTK_TIME of
 * the ground speed, at least TURN_PLAN_MIN_XTK and at most TURN_PLAN_MAX_XTK
 * @param groundspeed the ground speed of the calculation
 */
export function turnPlanGate(groundspeed: Knots): NauticalMiles {
    return Math.min(Math.max(groundspeed * TURN_PLAN_MAX_XTK_TIME / HOURS_TO_SECONDS, TURN_PLAN_MIN_XTK), TURN_PLAN_MAX_XTK);
}

/**
 * On the abeam plan the waypoint alert starts this long before the abeam line, at the along-track closure rate, and not
 * with the plan (checked in the KLN 89 trainer, 2026-10-20: 14 to 16 s)
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
 * The active leg as NavCalculator resolves it in a calculation
 */
interface ActiveLeg {
    /** The active waypoint */
    toLeg: KLNFlightplanLeg;
    /** The start of the active leg, for a Direct To where it was activated */
    fromLeg: FromLeg;
    /** The path of the active leg: the path of fromLeg, or past a leg without length the leg before it (#120) */
    legPath: GeoCircle;
}

/**
 * This class updates all navigation variables
 */
export class NavCalculator implements CalcTickable {
    private readonly turnAnticipation: UserSetting<boolean>;

    private lastTurnStackDistance: NauticalMiles | null = null;

    /**
     * Set when the active flight plan moves on to the next leg by itself in this calculation: an anticipated or abeam turn
     * starts (4-8), or a waypoint is sequenced without a turn (4-9). tick() clears it first and turns it into
     * NavPageState.legChangeDtkDelta last, so it holds nothing from one calculation to the next (#434, #407)
     */
    private legChange = false;


    constructor(private readonly sensors: Sensors, private readonly memory: VolatileMemory, private readonly magvar: KLNMagvar, userSettings: KLN90BUserSettings, private readonly modeController: ModeController, private readonly planeSettings: KLN90PlaneSettings) {
        this.turnAnticipation = userSettings.getSetting("turnAnticipation");
    }


    tick(): void {
        const nav = this.memory.navPage;
        //#434: a leg change is measured against the DTK the previous calculation showed
        const previousDtk = nav.desiredTrack;
        this.legChange = false;
        nav.legChangeDtkDelta = null;
        if (nav.isSelfTestActive) {
            nav.xtkToActive = -2.5;
            nav.steeringPath = null;
            nav.distToActive = 34.5;
            nav.desiredTrack = this.magvar.magToTrue(315);
            nav.eteToActive = null;
            nav.distToDest = null;
            nav.eteToDest = null;
            nav.bearingToActive = this.magvar.magToTrue(130);
            nav.bearingAtActive = nav.bearingToActive;
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

        const leg = this.updateActiveLeg(false);
        if (leg === null) {
            this.setOutput();
            return;
        }
        const {toLeg, fromLeg, legPath} = leg;

        //The distance flown in one calculation tick
        const tickDistance = this.sensors.in.gps.groundspeed / HOURS_TO_SECONDS / 1000 * TICK_TIME_CALC;

        this.popEndedTurn(legPath, tickDistance);
        this.updateCourse(leg);

        //#407: what the decisions below may change, which then shows in this calculation
        const activeWaypoint = nav.activeWaypoint;
        const fromLegBefore = activeWaypoint.getFromLeg();
        const turnBefore = activeWaypoint.turnStack[activeWaypoint.turnStack.length - 1];

        //waypoint sequencing
        if (this.modeController.isObsModeActive()) {
            //5-35: no sequencing in OBS mode; the alert as for a waypoint without a turn (#147, checked in the KLN 89
            //trainer, 2026-10-14)
            nav.waypointAlert = this.sensors.in.gps.groundspeed > 2 && this.isAlertWithoutTurn();
        } else if (this.sensors.in.gps.groundspeed > 2) {
            TO_GEOPOINT_CACHE.set(toLeg.wpt);
            const followingLeg = activeWaypoint.getFollowingLeg();

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
                const {lead, radius: turnRadius} = turnLead(this.sensors.in.gps.groundspeed, turnAngle, inboundLegLength(fromLeg.wpt, fromLeg.path, toLeg.wpt));
                //The roll-in on top of the lead is a deliberate departure from the trainer, which adds none: the unit
                //calculates at 1 Hz and can start a turn up to a second late, and the sim's autopilot and aircraft need
                //time to roll in. Users reported overshoots before it was added, and the default autopilot follows the GPS
                //SimVars, so the displayed and the commanded turn start cannot be split
                const turnPoint = lead + distanceToAchieveBankAngleChange(desiredBankAngle, this.sensors.in.gps.groundspeed);
                //The turn starts at an along-track distance, measured along the inbound leg: on course it is the straight
                //distance, off course it is not (checked in the KLN 89 trainer, 2026-10-20)
                const along = alongTrackDistance(legPath, toLeg.wpt, this.sensors.in.gps.coords);
                //#157: the cross track to the active leg's own path, not to a turn circle, decides every calculation
                //whether the aircraft is on the leg or off it (checked in the KLN 89 trainer, 2026-10-20: not latched).
                //#438: it also updates the turn plan, on the leg and off it
                const legXtk = UnitType.GA_RADIAN.convertTo(legPath.distance(this.sensors.in.gps.coords), UnitType.NMILE);
                this.updateTurnPlan(Math.abs(legXtk));

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
                    //(tickOffLeg) is the exception: it starts again by the plan once the aircraft is back on the leg
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
                            this.legChange = true; //4-8: the DTK switches to the next leg with the turn (#434)
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
                            this.legChange = true; //The DTK is the next leg's from the abeam line (#434)
                            console.log("abeam turn: moving to next wpt", toLeg.wpt, activeWaypoint.getActiveWpt());
                        }
                    }

                    nav.waypointAlert = this.isAlertWithTurn(legPath, along, turnPoint); //Arrow flashes until end of turn and the light remains on until end of turn: https://youtu.be/S1lt2W95bLA?si=C45kt8pik15Iodoy&t=2245

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
                        this.sequenceToNextWaypoint();
                        console.log("moving to next wpt", toLeg.wpt, activeWaypoint.getActiveWpt());
                    }
                }

            } else {
                nav.waypointAlert = this.isAlertWithoutTurn();
                if (toLeg.fixType !== KLNFixType.MAP && nav.toFrom === FROM) {
                    this.sequenceToNextWaypoint();
                    console.log("moving to next wpt", toLeg.wpt, activeWaypoint.getActiveWpt());
                }
            }
        } else {
            nav.waypointAlert = false;
        }

        //#407: a turn start or a sequencing shows its new leg in the calculation that made it: ident, distance, bearing,
        //ETE, DTK, XTK and TO/FROM, on the pages and in every output alike (checked in the KLN 89 trainer, 2026-10-27,
        //docs/kln89-trainer-record.md: no lag at any turn start or sequencing, also with turn anticipation off, run a12).
        //The decisions above read the values of the leg as it was, so the values are computed again after them, and only
        //when they changed the active leg or the turn in use. The end-of-turn pop is not run again
        let shown = leg;
        if (activeWaypoint.getFromLeg() !== fromLegBefore || activeWaypoint.turnStack[activeWaypoint.turnStack.length - 1] !== turnBefore) {
            const after = this.updateActiveLeg(true);
            if (after === null) {
                this.setLegChangeDtkDelta(previousDtk);
                this.setOutput();
                return;
            }
            this.updateCourse(after);
            shown = after;
        }

        //#373, #100: the path roll steering follows, taken after the sequencing of this tick (which may have changed the
        //leg), so that a turn pushed in this tick is steered in this tick
        nav.steeringPath = this.steeringPath(shown.legPath);

        this.setLegChangeDtkDelta(previousDtk);
        this.setOutput();
    }

    /**
     * Resolves the active leg and writes its distance, bearing and ETE values (6-18: always the direct distance, even for
     * arcs). Without an active leg it activates FPL 0, and without one there either it flags the values. A leg of no
     * length (FROM and TO the same waypoint) is sequenced past at once, onto the leg after it. The last one keeps the
     * course of the leg before it (#120), and without a leg before only distance, bearing and ETE remain
     * @param afterDecisions true for the pass after the turn and sequencing decisions of the calculation (#407)
     * @returns the active leg, or null when the values were flagged or no leg before one of no length gives a course
     */
    private updateActiveLeg(afterDecisions: boolean): ActiveLeg | null {
        const nav = this.memory.navPage;
        const activeWaypoint = nav.activeWaypoint;
        let toLeg = activeWaypoint.getActiveLeg();

        if (toLeg === null) {
            toLeg = activeWaypoint.activateFpl0();
        }

        if (toLeg === null) {
            this.setFlag();
            return null;
        }

        let fromLeg = activeWaypoint.getFromLeg()!;
        let legPath: GeoCircle | null = fromLeg.path;
        while (!this.modeController.isObsModeActive() && isNaN(fromLeg.path.center[0])) { //Happens when FROM and TO are the same waypoint
            const idx = activeWaypoint.getActiveFplIdx();
            activeWaypoint.sequenceToNextWaypoint();
            if (activeWaypoint.getActiveFplIdx() === idx) {
                //#120: the last leg has no length. The unit keeps navigating on the course of the leg before it (checked
                //in the KLN 89 trainer, 2026-10-14); without a leg before, only distance, bearing and ETE remain
                legPath = this.getIncomingPath(idx);
                break;
            }
            console.warn("invalid path, sequencing to the next waypoint", fromLeg);
            if (afterDecisions) {
                //#434, #407: the leg change of this calculation onto a duplicated waypoint (4-9) goes on past the leg of
                //no length, and its DTK is the one of the leg after it. In the first pass the active leg was changed
                //between two calculations, by a Direct To, an activation, an FPL 0 edit or a switch to LEG, which is no
                //leg change (the design's call, not flown in the trainer). A defensive duplicate of the mark that
                //sequenceToNextWaypoint sets: a skip here always follows a sequencing without an own turn (an own turn
                //is never started toward a copy of the waypoint), which has set the flag already; the line stays
                //so that the leg change is marked here too should that ever change
                this.legChange = true;
            }
            toLeg = activeWaypoint.getActiveLeg()!;
            fromLeg = activeWaypoint.getFromLeg()!;
            legPath = fromLeg.path;
        }

        //6-18 Always direct distance, even for arcs
        nav.distToActive = UnitType.GA_RADIAN.convertTo(this.sensors.in.gps.coords.distance(toLeg.wpt), UnitType.NMILE);

        const futureLegs = activeWaypoint.getFutureLegs();
        nav.distToDest = calcDistToDestination(nav, futureLegs);

        //#426: with the aircraft on the waypoint there is no bearing to it. It is null, as any missing value, so the
        //displays show dashes (3-31) and the outputs write their null value. The course at the waypoint is null there too
        nav.bearingToActive = bearingBetween(this.sensors.in.gps.coords, toLeg.wpt);
        nav.bearingAtActive = courseAtWaypoint(this.sensors.in.gps.coords, toLeg.wpt);

        //ETE
        if (this.sensors.in.gps.groundspeed > 2) {
            nav.eteToActive = nav.distToActive / this.sensors.in.gps.groundspeed * HOURS_TO_SECONDS;
            nav.eteToDest = nav.distToDest !== null ? nav.distToDest / this.sensors.in.gps.groundspeed * HOURS_TO_SECONDS : null; //#393: 0 is a value
        } else {
            nav.eteToActive = null;
            nav.eteToDest = null;
            nav.waypointAlert = false;
        }

        if (legPath === null) {
            nav.xtkToActive = null;
            nav.steeringPath = null;
            nav.desiredTrack = null;
            nav.toFrom = null;
            nav.bearingForAP = nav.bearingToActive;
            nav.waypointAlert = false;
            return null;
        }

        return {toLeg, fromLeg, legPath};
    }

    /**
     * Pops the entry on top of the turn stack once the aircraft is past its end, so that XTK and DTK follow the next
     * entry or the leg again. Run once per calculation, before the course values, and not in the pass after the decisions
     * (#407), so an entry pushed by the decisions cannot end in the calculation that pushed it. The abeam turn has no end
     * of its own: at the sequencing of its waypoint it becomes its run-out (ActiveWaypoint.setActiveIdx, #406), which
     * ends by isPastEndOfRunOut
     * @param legPath the path of the active leg
     * @param tickDistance the distance flown in one calculation tick
     */
    private popEndedTurn(legPath: GeoCircle, tickDistance: NauticalMiles): void {
        const activeWaypoint = this.memory.navPage.activeWaypoint;
        if (activeWaypoint.turnStack.length === 0) {
            return;
        }
        const turnStackEntry = activeWaypoint.turnStack[activeWaypoint.turnStack.length - 1];
        const distFromCurrent = UnitType.GA_RADIAN.convertTo(this.sensors.in.gps.coords.distance(turnStackEntry.switchPoint), UnitType.NMILE);
        if (turnStackEntry.isRunOut ? this.isPastEndOfRunOut(turnStackEntry, tickDistance, legPath)
            : turnStackEntry.abeamTurnSign === null && (turnStackEntry.turnBisector !== undefined ? this.isPastEndOfTurn(turnStackEntry, turnStackEntry.turnBisector, tickDistance, legPath)
            : distFromCurrent <= tickDistance || distFromCurrent > this.lastTurnStackDistance!)) {
            console.debug("Reached end of turn", distFromCurrent, this.lastTurnStackDistance, activeWaypoint.turnStack);
            //We have reached the end of the turn, XTK will now use the normal leg again
            activeWaypoint.turnStack.pop();
            const nextEntry = activeWaypoint.turnStack[activeWaypoint.turnStack.length - 1];
            if (nextEntry) {
                this.lastTurnStackDistance = UnitType.GA_RADIAN.convertTo(this.sensors.in.gps.coords.distance(nextEntry.switchPoint), UnitType.NMILE);
            } else {
                this.lastTurnStackDistance = null;
            }
        } else {
            this.lastTurnStackDistance = distFromCurrent;
        }
    }

    /**
     * Writes XTK, DTK, the bearing for the autopilot and TO/FROM of the active leg, or of the turn on top of the turn
     * stack (4-8)
     * @param leg the active leg as updateActiveLeg resolved it
     */
    private updateCourse(leg: ActiveLeg): void {
        const nav = this.memory.navPage;
        const turnStack = nav.activeWaypoint.turnStack;
        const legPath = leg.legPath;

        //XTK
        if (turnStack.length > 0) {
            //4-8 XTK will be based on a smooth turn
            const turnStackEntry = turnStack[turnStack.length - 1];
            nav.xtkToActive = turnStackEntry.abeamTurnSign !== null ? turnStackEntry.abeamTurnSign * nav.distToActive!
                : UnitType.GA_RADIAN.convertTo(turnStackEntry.path.distance(this.sensors.in.gps.coords), UnitType.NMILE);
        } else {
            nav.xtkToActive = UnitType.GA_RADIAN.convertTo(legPath.distance(this.sensors.in.gps.coords), UnitType.NMILE);
        }

        //DTK
        let dtk: Degrees;
        if (this.modeController.isObsModeActive()) {
            nav.desiredTrack = null;
            nav.bearingForAP = nav.bearingToActive;
            dtk = this.modeController.getObsTrue();
        } else {
            //XTK will be switched to the next XTK right at the start of the turn, even if the active waypoint has not been switched yet
            const pathForDtk = turnStack.length > 0 ? turnStack[turnStack.length - 1].pathForDtk : legPath;

            //#433: on the VOR of the DME arc the DTK at the end of the arc
            dtk = dtkAtClosest(pathForDtk, this.sensors.in.gps.coords) ?? pathForDtk.bearingAt(pathForDtk.closest(leg.toLeg.wpt, VEC3_CACHE));
            nav.desiredTrack = dtk;

            if (legPath.isGreatCircle()) {
                nav.bearingForAP = nav.bearingToActive;
            } else {
                //The autopilot does not play well with DME arcs, when DTK and bearing to does not match.
                nav.bearingForAP = dtk;
            }
        }

        //#426: on the waypoint the aircraft is on the line between TO and FROM, which the comparison counts as TO
        nav.toFrom = nav.bearingToActive === null ? TO : Math.abs(NavMath.diffAngle(nav.bearingToActive, dtk)) <= 90;
    }

    /**
     * #434: marks a leg change of this calculation (legChange) with how far the DTK moved against the one the previous
     * calculation showed. The course messages post at once at a leg change (4-8, B-1). A Direct To, an activation or an
     * FPL 0 edit between two calculations sets no legChange, so it marks nothing
     * @param previousDtk the DTK of the previous calculation
     */
    private setLegChangeDtkDelta(previousDtk: Degrees | null): void {
        const nav = this.memory.navPage;
        nav.legChangeDtkDelta = this.legChange && previousDtk !== null && nav.desiredTrack !== null
            ? Math.abs(NavMath.diffAngle(previousDtk, nav.desiredTrack)) : null;
    }

    /**
     * The path roll steering follows (the roll steering design, docs/superpowers/specs/2026-10-19-roll-steering-design.md,
     * section 4A). Without a turn it is the leg path. During a turn, including the lead-in before it, it is the turn
     * circle (turnStack[0]), so that the bank is established when the circle begins. More than one radius from the circle
     * the turn is no path to follow: beyond its center the closest point lies on the far side, where the circle runs
     * backward, and farther outside the circle steering back to it is a detour. The aircraft then steers on the next leg
     * (pathForDtk) until the turn ends. The run-out of an abeam turn (#406) has the new leg as its path, so it is steered
     * on as the leg, and RollSteeringController does not treat it as a turn circle
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
     * #438: where the anticipated turn of the active waypoint starts follows the cross track to the active leg (the
     * design, docs/superpowers/specs/2026-10-29-turn-plan-decision-design.md, section 3.1). An undecided plan is decided
     * at once, however far the turn point is: at the lead (TurnPlan.AT_LEAD) with at most turnPlanGate of cross track,
     * otherwise at the abeam line (TurnPlan.AT_ABEAM). The plan is undecided at the first calculation of a leg: after an
     * activation, a sequencing, a Direct To, and an edit of the next leg that drops a turn plan (#408). Checked in the
     * KLN 89 trainer, 2026-10-28 and 2026-10-29: decided at the first calculation of a leg, with no window before the turn
     * point (every window tried was refuted by a later pass).
     *
     * From then on a turn plan becomes the abeam plan in the first calculation beyond the gate, and an abeam plan stays.
     * The trainer decides again at a re-initialization: a jump of the position, a GPS fix after a search, an edit of the
     * active waypoint. Each shows up here as a new cross track, and beyond the gate it gives the abeam plan in the same
     * calculation, as the trainer did. Two calls are the design's, not the trainer's:
     * - the drift case: an aircraft that leaves the leg in flight, with no re-initialization, loses the turn plan once it
     *   is beyond the gate. The trainer's take-home flying re-intercepts from any offset, so it could not show this;
     * - a jump that brings an aircraft on the abeam plan within the gate keeps the abeam plan, where the trainer would
     *   decide again and take the turn plan. No trainer pass shows this direction.
     * The alternative to both is the plan latched until the next activation or re-initialization, which needs a hook for
     * each re-initialization. The gate takes the ground speed of the calculation, so slowing down alone can turn a turn
     * plan into the abeam plan (the design's call; the trainer flew every pass at a constant speed).
     *
     * The plan is also updated off the leg (more than OFF_LEG_XTK from it), where tickOffLeg runs: at 239 kt a turn plan
     * holds between 4.0 and 4.9 NM, and the turn starts at the lead once the aircraft is back on the leg (checked in the
     * KLN 89 trainer, 2026-10-28 and 2026-10-29, Y2 and G48). Not once the waypoint's own turn has started: a started turn
     * is not planned again, whatever the cross track, and only tickOffLeg drops it
     * @param legXtk the absolute cross track to the active leg
     */
    private updateTurnPlan(legXtk: NauticalMiles): void {
        const activeWaypoint = this.memory.navPage.activeWaypoint;
        if (activeWaypoint.ownTurnStarted) {
            return;
        }
        if (activeWaypoint.turnPlan === null) {
            activeWaypoint.turnPlan = legXtk <= turnPlanGate(this.sensors.in.gps.groundspeed) ? TurnPlan.AT_LEAD : TurnPlan.AT_ABEAM;
        } else if (activeWaypoint.turnPlan === TurnPlan.AT_LEAD && legXtk > turnPlanGate(this.sensors.in.gps.groundspeed)) {
            activeWaypoint.turnPlan = TurnPlan.AT_ABEAM;
        }
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
            || (outside && this.isWithinTimeOfAlong(legPath, along, WPT_ALERT_OFF_LEG));

        if (toLeg.fixType === KLNFixType.MAP) { //don't move missed approach waypoint!
            return;
        }
        const pos = this.sensors.in.gps.coords;
        const activeDistance = segmentDistance(fromLeg.wpt, toLeg.wpt, fromLeg.path.isGreatCircle() ? undefined : fromLeg.path, pos);
        const nextDistance = segmentDistance(toLeg.wpt, followingLeg.wpt, toLeg.arcData?.circle, pos);
        if (nextDistance <= activeDistance) {
            this.sequenceToNextWaypoint();
            console.log("off the leg: moving to next wpt", toLeg.wpt, activeWaypoint.getActiveWpt());
        }
    }

    /**
     * Sequences the active waypoint, and marks the sequencing as a leg change of this calculation (legChange, #434) when
     * no turn of the waypoint's own was started: the sequencing without a turn (4-9), also the one off the leg. After an
     * own turn the DTK switched at the turn start, which was the leg change (4-8), so the sequencing at the bisector is
     * none; when the turn started in this same calculation, that start has marked it already
     */
    private sequenceToNextWaypoint(): void {
        const activeWaypoint = this.memory.navPage.activeWaypoint;
        const withoutTurn = !activeWaypoint.ownTurnStarted;
        const idx = activeWaypoint.getActiveFplIdx();
        activeWaypoint.sequenceToNextWaypoint();
        if (withoutTurn && activeWaypoint.getActiveFplIdx() !== idx) {
            this.legChange = true;
        }
    }

    /**
     * Whether the aircraft will reach a point ahead on the active leg within the time, at the closure rate along the leg:
     * the ground speed times the cosine of the angle between the track and the leg. False while the aircraft does not
     * close on the point, and once it is past it. For the abeam line of the active waypoint (alongToPoint the
     * along-track distance to the waypoint): past it the waypoint is sequenced off the leg on the outside, and the abeam
     * turn is on the stack on the abeam plan, but at the MAP neither happens, and the alert would otherwise stay on
     * through the whole missed approach (#157)
     * @param legPath the path of the active leg
     * @param alongToPoint the along-track distance to the point, negative past it
     * @param time
     */
    private isWithinTimeOfAlong(legPath: GeoCircle, alongToPoint: NauticalMiles, time: Seconds): boolean {
        const track = this.sensors.in.gps.getTrackTrueRespectingGroundspeed();
        if (track === null || alongToPoint < 0) {
            return false;
        }
        const legDtk = dtkAtClosest(legPath, this.sensors.in.gps.coords);
        if (legDtk === null) {
            return false;
        }
        const closure = this.sensors.in.gps.groundspeed * Math.cos(UnitType.DEGREE.convertTo(NavMath.diffAngle(legDtk, track), UnitType.RADIAN)) / HOURS_TO_SECONDS;
        return closure > 0 && alongToPoint / closure <= time;
    }

    /**
     * The waypoint alert of a waypoint with a turn to anticipate (4-8). On the turn plan it starts
     * WPT_ALERT_WITH_TURN_ANTI before the turn point at the closure rate along the leg, or once the aircraft is inside the
     * turn point, and not with the plan, which is decided as soon as the leg is active (#438; checked in the KLN 89
     * trainer, 2026-10-29: 20 to 23 s of along-track closure before the turn point on every pass of the turn plan). It is a
     * condition of each calculation, so an edit of the next leg that moves the turn point more than 20 s away pauses it
     * (#408, the trainer's a3 and a4, 2026-10-27). It holds while the aircraft is TO the waypoint: without a turn (at the
     * MAP, or when the aircraft turned away before the turn point) it ends once the waypoint is behind. On the abeam plan
     * it starts WPT_ALERT_ABEAM_TURN before the abeam line, at the closure rate along the leg, and not while the aircraft
     * does not close on the line (checked in the KLN 89 trainer, 2026-10-20). It stays on while a turn is flown, also a
     * turn of the previous waypoint (#156) or the run-out of its abeam turn (#406)
     * @param legPath the path of the active leg
     * @param along the along-track distance to the active waypoint
     * @param turnPoint the along-track distance to the active waypoint at which the turn of the turn plan starts
     */
    private isAlertWithTurn(legPath: GeoCircle, along: NauticalMiles, turnPoint: NauticalMiles): boolean {
        const activeWaypoint = this.memory.navPage.activeWaypoint;
        if (activeWaypoint.turnStack.length > 0) {
            return true;
        }
        if (activeWaypoint.turnPlan === TurnPlan.AT_LEAD) {
            return this.memory.navPage.toFrom === TO
                && (along <= turnPoint || this.isWithinTimeOfAlong(legPath, along - turnPoint, WPT_ALERT_WITH_TURN_ANTI));
        }
        return activeWaypoint.turnPlan === TurnPlan.AT_ABEAM && this.isWithinTimeOfAlong(legPath, along, WPT_ALERT_ABEAM_TURN);
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
     * #406: the run-out of an abeam turn ends once the aircraft is past the abeam line of the old waypoint on the new leg
     * (within the tick ahead, as the end of a turn circle), the far end of the turn of no size (checked in the KLN 89
     * trainer, 2026-10-27: R2, R6 and a10 ended 0.02 to 0.17 NM before that line). A track angle, a cross track or a time
     * does not end it: an aircraft that does not progress along the new leg keeps the alert on (run a1). It also ends
     * when the aircraft is more than OFF_LEG_XTK from the active leg, as a turn circle does (the design's call, not flown
     * in the trainer)
     * @param entry the run-out (TurnStackEntry.runOut)
     * @param tickDistance the distance flown in one calculation tick
     * @param activeLegPath the path of the active leg
     */
    private isPastEndOfRunOut(entry: TurnStackEntry, tickDistance: NauticalMiles, activeLegPath: GeoCircle): boolean {
        const pos = this.sensors.in.gps.coords;
        return alongTrackDistance(entry.pathForDtk, entry.switchPoint, pos) <= tickDistance
            || Math.abs(UnitType.GA_RADIAN.convertTo(activeLegPath.distance(pos), UnitType.NMILE)) > OFF_LEG_XTK;
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
        nav.bearingAtActive = null;
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
        //The GPS SimVars keep the frame of the aircraft, also in OBS mode (#371)
        this.sensors.out.setDesiredTrack(this.modeController.getDtkOrObsTrue(), track, magvar);
        this.sensors.out.setWpBearing(nav.bearingForAP, nav.bearingToActive, magvar);
        this.sensors.out.setDistance(nav.distToActive);
        this.sensors.out.setWPTETE(nav.eteToActive, this.eteToEta(nav.eteToActive));
        this.sensors.out.setDestETE(nav.eteToDest, this.eteToEta(nav.eteToDest));
        this.sensors.out.setPos(this.sensors.in.gps.coords, this.sensors.in.gps.groundspeed, track, magvar, !this.sensors.in.gps.isValid());

        this.sensors.out.setWPIndex(nav.activeWaypoint.getActiveFplIdx(), nav.activeWaypoint.fpl0.getLegs().length);

        this.sensors.out.setPrevWpt(nav.activeWaypoint.getFromWpt());
        this.sensors.out.setNextWpt(nav.activeWaypoint.getActiveWpt());

        this.sensors.out.setMode(nav.navmode, nav.isSelfTestActive, !this.planeSettings.input.externalSwitches.legObsSwitchInstalled);
        this.sensors.out.setAnnunTest(nav.isSelfTestActive);
    }

    private eteToEta(ete: Seconds | null): Seconds | null {
        if (ete === null) {
            return null;
        }

        return this.sensors.in.gps.timeZulu.getSecondsSinceMidnight() + ete;
    }
}
