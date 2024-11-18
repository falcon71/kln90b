import {CalcTickable, TICK_TIME_CALC} from "../../TickController";
import {Sensors} from "../../Sensors";
import {FROM, VolatileMemory} from "../VolatileMemory";
import {GeoCircle, GeoPoint, NavMath, UnitType, UserSetting} from "@microsoft/msfs-sdk";
import {KLN90BUserSettings} from "../../settings/KLN90BUserSettings";
import {Degrees, NauticalMiles, Seconds} from "../Units";
import {ModeController} from "../../services/ModeController";
import {KLNFixType} from "../flightplan/Flightplan";
import {KLNMagvar} from "./KLNMagvar";
import {calcDistToDestination} from "../../services/FlightplanUtils";
import {KLN90PlaneSettings} from "../../settings/KLN90BPlaneSettings";
import {bankeAngleForStandardTurn, distanceToAchieveBankAngleChange} from "../../services/KLNNavmath";
import {TurnStackEntry} from "../flightplan/ActiveWaypoint";


//4-8
const WPT_ALERT_WITH_TURN_ANTI = 20;
const WPT_ALERT_WITHOUT_TURN_ANTI = 36;

export const HOURS_TO_SECONDS = 3600;

const VEC3_CACHE = new Float64Array(3);
const TO_GEOPOINT_CACHE = new GeoPoint(0, 0);

export const MAX_BANK_ANGLE = 25;


/**
 * This class updates all navigation variables
 */
export class NavCalculator implements CalcTickable {
    private readonly turnAnticipation: UserSetting<boolean>;
    private lastDistanceToTurn = 9999;
    private lastDistanceToActive = 9999;

    private lastTurnStackDistance: NauticalMiles | null = null;


    constructor(private readonly sensors: Sensors, private readonly memory: VolatileMemory, private readonly magvar: KLNMagvar, userSettings: KLN90BUserSettings, private readonly modeController: ModeController, private readonly planeSettings: KLN90PlaneSettings) {
        this.turnAnticipation = userSettings.getSetting("turnAnticipation");
    }


    tick(): void {
        const nav = this.memory.navPage;
        if (nav.isSelfTestActive) {
            nav.xtkToActive = -2.5;
            nav.distToActive = 34.5;
            nav.desiredTrack = this.magvar.magToTrue(315);
            nav.eteToActive = null;
            nav.distToDest = null;
            nav.eteToDest = null;
            nav.bearingToActive = 130;
            nav.bearingForAP = 130;
            nav.toFrom = FROM;
            nav.waypointAlert = true;
            nav.xtkScale = 5;
            nav.activeWaypoint.clearTurnStack();
            this.lastDistanceToTurn = 9999;
            this.lastDistanceToActive = 9999;
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

        if (!this.modeController.isObsModeActive() && isNaN(fromLeg.path.center[0])) { //Happens when FROM and TO are the same waypoint
            console.warn("invalid path, sequencing to the next waypoint", fromLeg);
            nav.activeWaypoint.sequenceToNextWaypoint();
            return;
        }

        //ETE
        if (this.sensors.in.gps.groundspeed > 2) {
            nav.eteToActive = nav.distToActive / this.sensors.in.gps.groundspeed * HOURS_TO_SECONDS;
            nav.eteToDest = nav.distToDest ? nav.distToDest / this.sensors.in.gps.groundspeed * HOURS_TO_SECONDS : null;
        } else {
            nav.eteToActive = null;
            nav.eteToDest = null;
            nav.waypointAlert = false;
        }

        //Special handling for turns
        if (nav.activeWaypoint.turnStack.length > 0) {
            const turnStackEntry = nav.activeWaypoint.turnStack[nav.activeWaypoint.turnStack.length - 1];
            const distFromCurrent = UnitType.GA_RADIAN.convertTo(this.sensors.in.gps.coords.distance(turnStackEntry.switchPoint), UnitType.NMILE);
            if (distFromCurrent <= this.sensors.in.gps.groundspeed / HOURS_TO_SECONDS / 1000 * TICK_TIME_CALC
                || distFromCurrent > this.lastTurnStackDistance!) {
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
            nav.xtkToActive = UnitType.GA_RADIAN.convertTo(turnStackEntry.path.distance(this.sensors.in.gps.coords), UnitType.NMILE);
        } else {
            nav.xtkToActive = UnitType.GA_RADIAN.convertTo(fromLeg.path.distance(this.sensors.in.gps.coords), UnitType.NMILE);
        }


        //DTK
        if (this.modeController.isObsModeActive()) {
            nav.desiredTrack = null;
            nav.bearingForAP = nav.bearingToActive;
            dtk = this.modeController.getObsTrue();
        } else {
            //XTK will be switched to the next XTK right at the start of the turn, even if the active waypoint has not been switched yet
            const pathForDtk = nav.activeWaypoint.turnStack.length > 0 ? nav.activeWaypoint.turnStack[nav.activeWaypoint.turnStack.length - 1].pathForDtk : fromLeg.path;

            dtk = pathForDtk.bearingAt(pathForDtk.closest(this.sensors.in.gps.coords, VEC3_CACHE));
            nav.desiredTrack = dtk;

            if (fromLeg.path.isGreatCircle()) {
                nav.bearingForAP = nav.bearingToActive;
            } else {
                //The autopilot does not play well with DME arcs, when DTK and bearing to does not match.
                nav.bearingForAP = dtk;
            }

        }


        nav.toFrom = Math.abs(NavMath.diffAngle(nav.bearingToActive, dtk)) <= 90;

        //waypoint sequencing
        const waypointSequencingAllowed = !this.modeController.isObsModeActive();
        if (waypointSequencingAllowed && this.sensors.in.gps.groundspeed > 2) {
            TO_GEOPOINT_CACHE.set(toLeg.wpt);
            const followingLeg = nav.activeWaypoint.getFollowingLeg();

            if (this.turnAnticipation.get()
                && followingLeg !== null
                && toLeg.flyOver !== true
                && !TO_GEOPOINT_CACHE.equals(followingLeg.wpt))  //Based on the KLN 89 trainer, it will overfly the waypoint, if it is duplicated
            {
                const desiredBankAngle = bankeAngleForStandardTurn(this.sensors.in.gps.groundspeed);
                const turnRadius = UnitType.METER.convertTo(NavMath.turnRadius(this.sensors.in.gps.groundspeed, desiredBankAngle), UnitType.NMILE);
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
                const turnAnticipationDistance = turnRadius * Math.tan((turnAngle / 2) * Avionics.Utils.DEG2RAD);
                const distanceToTurn = nav.distToActive - turnAnticipationDistance - distanceToAchieveBankAngleChange(desiredBankAngle, this.sensors.in.gps.groundspeed);
                const timeToTurn = distanceToTurn / this.sensors.in.gps.groundspeed * HOURS_TO_SECONDS;

                nav.waypointAlert = timeToTurn <= WPT_ALERT_WITH_TURN_ANTI || nav.activeWaypoint.turnStack.length > 0; //Arrow flashes until end of turn and the light remains on until end of turn: https://youtu.be/S1lt2W95bLA?si=C45kt8pik15Iodoy&t=2245
                //console.log(nav.distToActive, turnAnticipationDistance, nav.waypointAlert, timeToTurn, toWpt);

                //We have reached the start of the turn but not the waypoint yet. XTK will now follow a curved path and DTK will indicate the next path
                if (toLeg.fixType !== KLNFixType.MAP && nav.activeWaypoint.turnStack.length === 0 &&
                    (distanceToTurn <= this.sensors.in.gps.groundspeed / HOURS_TO_SECONDS / 1000 * TICK_TIME_CALC //Distance is within the next tick, we rather start the turn a little too early than too late
                        || (nav.waypointAlert && distanceToTurn >= this.lastDistanceToTurn))) {
                    const fromPath = new GeoCircle(fromLeg.path.center, fromLeg.path.radius);

                    //4-8 We save information on how this turn was calculated
                    const startOfTurn = new GeoPoint(toLeg.wpt.lat, toLeg.wpt.lon);
                    startOfTurn.offset(NavMath.reciprocateHeading(fromDtk), UnitType.NMILE.convertTo(turnAnticipationDistance, UnitType.GA_RADIAN));

                    const turnCircle = this.calculateTurnCircle(turnRadius, startOfTurn, fromDtk, NavMath.getTurnDirection(fromDtk, nextDtk));
                    const endOfTurn = new GeoPoint(toLeg.wpt.lat, toLeg.wpt.lon);
                    endOfTurn.offset(nextDtk, UnitType.NMILE.convertTo(turnAnticipationDistance, UnitType.GA_RADIAN));
                    nav.activeWaypoint.turnStack.push(new TurnStackEntry(turnCircle, endOfTurn, nextPath));
                    console.log("turn: moving to next wpt", toLeg.wpt, nav.activeWaypoint.getActiveWpt(), distanceToTurn, this.lastDistanceToTurn);

                    //Since we add a few seconds before the turn to reach the desired bank angle, we need to keep the old path for a short moment
                    this.lastTurnStackDistance = UnitType.GA_RADIAN.convertTo(this.sensors.in.gps.coords.distance(startOfTurn), UnitType.NMILE);
                    nav.activeWaypoint.turnStack.push(new TurnStackEntry(fromPath, startOfTurn, nextPath));
                }

                //We are now abeam the waypoint
                if (toLeg.fixType !== KLNFixType.MAP &&
                    (nav.waypointAlert && nav.distToActive >= this.lastDistanceToActive)) {

                    //don't move missed approach waypoint!
                    nav.activeWaypoint.sequenceToNextWaypoint();
                    console.log("moving to next wpt", toLeg.wpt, nav.activeWaypoint.getActiveWpt());
                    this.lastDistanceToTurn = 9999;
                    this.lastDistanceToActive = 9999;
                } else {
                    this.lastDistanceToTurn = distanceToTurn;
                    this.lastDistanceToActive = nav.distToActive;
                }


            } else {
                nav.waypointAlert = nav.eteToActive! <= WPT_ALERT_WITHOUT_TURN_ANTI;
                if (toLeg.fixType !== KLNFixType.MAP && nav.toFrom === FROM) {
                    nav.activeWaypoint.sequenceToNextWaypoint();
                    console.log("moving to next wpt", toLeg.wpt, nav.activeWaypoint.getActiveWpt());
                }
            }
        } else {
            nav.waypointAlert = false;
        }

        this.setOutput();
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
        nav.distToActive = null;
        nav.distToDest = null;
        nav.desiredTrack = null;
        nav.eteToActive = null;
        nav.eteToDest = null;
        nav.bearingToActive = null;
        nav.bearingForAP = null;
        nav.toFrom = null;
        nav.waypointAlert = false;
        nav.xtkScale = 5;
        this.lastDistanceToTurn = 9999;
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
        this.sensors.out.setPos(this.sensors.in.gps.coords, this.sensors.in.gps.groundspeed, track, magvar);

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
