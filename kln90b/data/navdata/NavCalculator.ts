import {CalcTickable, TICK_TIME_CALC} from "../../TickController";
import {Sensors} from "../../Sensors";
import {FROM, TO, VolatileMemory} from "../VolatileMemory";
import {GeoPoint, NavMath, UnitType, UserSetting} from "@microsoft/msfs-sdk";
import {KLN90BUserSettings} from "../../settings/KLN90BUserSettings";
import {Degrees, Knots, Seconds} from "../Units";
import {ModeController} from "../../services/ModeController";
import {KLNFixType} from "../flightplan/Flightplan";
import {KLNMagvar} from "./KLNMagvar";
import {calcDistToDestination} from "../../services/FlightplanUtils";
import {KLN90PlaneSettings} from "../../settings/KLN90BPlaneSettings";


//4-8
const WPT_ALERT_WITH_TURN_ANTI = 20;
const WPT_ALERT_WITHOUT_TURN_ANTI = 36;

export const HOURS_TO_SECONDS = 3600;

const VEC3_CACHE = new Float64Array(3);

/**
 * This class updates all navigation variables
 */
export class NavCalculator implements CalcTickable {
    private readonly turnAnticipation: UserSetting<boolean>;
    private lastDistance = 9999;


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
            this.lastDistance = 9999;
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

        if (this.modeController.isObsModeActive()) {
            nav.desiredTrack = null;
            nav.bearingForAP = nav.bearingToActive;
            dtk = this.modeController.getObsTrue();
        } else {
            if (isNaN(fromLeg.path.center[0])) { //Happens when FROM and TO are the same waypoint
                console.warn("invalid path, sequencing to the next waypoint", fromLeg);
                nav.activeWaypoint.sequenceToNextWaypoint();
                return;
            }
            dtk = fromLeg.path.bearingAt(fromLeg.path.closest(this.sensors.in.gps.coords, VEC3_CACHE));
            nav.desiredTrack = dtk;

            if (fromLeg.path.isGreatCircle()) {
                nav.bearingForAP = nav.bearingToActive;
            } else {
                //The autopilot does not play well with DME arcs, when DTK and bearing to does not match.
                nav.bearingForAP = dtk;
            }

        }

        if (this.sensors.in.gps.groundspeed > 2) {
            nav.eteToActive = nav.distToActive / this.sensors.in.gps.groundspeed * HOURS_TO_SECONDS;
            nav.eteToDest = nav.distToDest ? nav.distToDest / this.sensors.in.gps.groundspeed * HOURS_TO_SECONDS : null;

        } else {
            nav.eteToActive = null;
            nav.eteToDest = null;
            nav.waypointAlert = false;
        }

        nav.xtkToActive = UnitType.GA_RADIAN.convertTo(fromLeg.path.distance(this.sensors.in.gps.coords), UnitType.NMILE);

        nav.toFrom = Math.abs(NavMath.diffAngle(nav.bearingToActive, dtk)) <= 90;

        //waypoint sequencing
        const waypointSequencingAllowed = !this.modeController.isObsModeActive();
        if (waypointSequencingAllowed && this.sensors.in.gps.groundspeed > 2) {
            const followingLeg = nav.activeWaypoint.getFollowingLeg();

            if (this.turnAnticipation.get() && followingLeg !== null && toLeg.flyOver !== true) {
                const turnRadius = UnitType.METER.convertTo(NavMath.turnRadius(this.sensors.in.gps.groundspeed, this.bankeAngleForStandardTurn(this.sensors.in.gps.groundspeed)), UnitType.NMILE);
                const fromDtk = fromLeg.path.bearingAt(fromLeg.path.closest(toLeg.wpt, VEC3_CACHE)); //Important for DME arcs, we need the DTK at the end of the arc, not the current one. Also helps for very long GC legs

                let nextDtk: number;
                if (toLeg.arcData === undefined) {
                    nextDtk = new GeoPoint(toLeg.wpt.lat, toLeg.wpt.lon).bearingTo(followingLeg.wpt);
                } else {
                    nextDtk = toLeg.arcData.circle.bearingAt(toLeg.arcData.entryFacility);
                }
                const turnAngle = Math.abs(NavMath.diffAngle(fromDtk, nextDtk));
                const turnAnticipationDistance = turnRadius * Math.tan((turnAngle / 2) * Avionics.Utils.DEG2RAD);
                const distanceToTurn = nav.distToActive - turnAnticipationDistance;
                const timeToTurn = distanceToTurn / this.sensors.in.gps.groundspeed * HOURS_TO_SECONDS;

                nav.waypointAlert = timeToTurn <= WPT_ALERT_WITH_TURN_ANTI;
                //console.log(nav.distToActive, turnAnticipationDistance, nav.waypointAlert, timeToTurn, toWpt);
                if (toLeg.fixType !== KLNFixType.MAP &&
                    (distanceToTurn <= this.sensors.in.gps.groundspeed / HOURS_TO_SECONDS / 1000 * TICK_TIME_CALC //Distance is within the next tick, we rather start the turn a little too early than too late
                        || (nav.waypointAlert && distanceToTurn > this.lastDistance))) {
                    //don't move missed approach waypoint!
                    nav.activeWaypoint.sequenceToNextWaypoint();
                    console.log("turn: moving to next wpt", toLeg.wpt, nav.activeWaypoint.getActiveWpt(), distanceToTurn, this.lastDistance);
                }
                this.lastDistance = distanceToTurn;
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
        nav.toFrom = TO;
        nav.waypointAlert = false;
        nav.xtkScale = 5;
        this.lastDistance = 9999;
    }

    private setOutput() {
        const nav = this.memory.navPage;
        const obsOut = this.modeController.getDtkOrObsMagnetic();
        const magvar = this.magvar.getCurrentMagvar();
        const track = this.sensors.in.gps.getTrackTrueRespectingGroundspeed();

        this.sensors.out.setXTK(nav.xtkToActive, nav.xtkScale);
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


    /**
     * https://edwilliams.org/avform147.htm#Turns
     * @param speed
     * @private
     */
    private bankeAngleForStandardTurn(speed: Knots) {
        return Math.min(57.3 * Math.atan(speed / 362.1), 25);
    }


}
