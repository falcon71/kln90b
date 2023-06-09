import {CalcTickable} from "../../TickController";
import {Sensors} from "../../Sensors";
import {FROM, TO, VolatileMemory} from "../VolatileMemory";
import {GeoPoint, NavMath, UnitType, UserSetting} from "@microsoft/msfs-sdk";
import {KLN90BUserSettings} from "../../settings/KLN90BUserSettings";
import {Degrees, Knots} from "../Units";
import {ModeController} from "../../services/ModeController";
import {KLNFixType} from "../flightplan/Flightplan";
import {KLNMagvar} from "./KLNMagvar";


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


    constructor(private readonly sensors: Sensors, private readonly memory: VolatileMemory, private readonly magvar: KLNMagvar, userSettings: KLN90BUserSettings, private readonly modeController: ModeController) {
        this.turnAnticipation = userSettings.getSetting("turnAnticipation");
    }


    tick(): void {
        const nav = this.memory.navPage;
        if (nav.isSelfTestActive) {
            nav.xtkToActive = -2.5;
            nav.distToActive = 34.5;
            nav.desiredTrack = 130;
            nav.eteToActive = null;
            nav.bearingToActive = 130;
            nav.toFrom = FROM;
            nav.waypointAlert = false;
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
        nav.bearingToActive = this.sensors.in.gps.coords.bearingTo(toLeg.wpt);

        let dtk: Degrees;

        if (this.modeController.isObsModeActive()) {
            nav.desiredTrack = null;
            dtk = this.modeController.getObsTrue();
        } else {
            dtk = fromLeg.path.bearingAt(fromLeg.path.closest(this.sensors.in.gps.coords, VEC3_CACHE));
            nav.desiredTrack = dtk;
        }

        if (this.sensors.in.gps.groundspeed > 2) {
            nav.eteToActive = nav.distToActive / this.sensors.in.gps.groundspeed * HOURS_TO_SECONDS;
        } else {
            nav.eteToActive = null;
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
                let nextDtk: number;
                if(toLeg.arcData === undefined){
                    nextDtk = new GeoPoint(toLeg.wpt.lat, toLeg.wpt.lon).bearingTo(followingLeg.wpt);
                } else {
                    nextDtk = toLeg.arcData.circle.bearingAt(toLeg.wpt);
                }
                const turnAngle  = Math.abs(NavMath.diffAngle(dtk, nextDtk));
                const turnAnticipationDistance = turnRadius * Math.tan((turnAngle / 2) * Avionics.Utils.DEG2RAD);
                const distanceToTurn = nav.distToActive - turnAnticipationDistance;
                const timeToTurn = distanceToTurn / this.sensors.in.gps.groundspeed * HOURS_TO_SECONDS;

                nav.waypointAlert = timeToTurn <= WPT_ALERT_WITH_TURN_ANTI;
                //console.log(nav.distToActive, turnAnticipationDistance, nav.waypointAlert, timeToTurn, toWpt);
                if (toLeg.fixType !== KLNFixType.MAP && (distanceToTurn <= 0 || (nav.waypointAlert && distanceToTurn > this.lastDistance))) {
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
        nav.desiredTrack = null;
        nav.eteToActive = null;
        nav.bearingToActive = null;
        nav.toFrom = TO;
        nav.waypointAlert = false;
        nav.xtkScale = 5;
        this.lastDistance = 9999;
    }

    private setOutput() {
        const nav = this.memory.navPage;
        const obsOut = this.modeController.getDtkOrObsMagnetic();
        const magvar = this.magvar.getCurrentMagvar();

        this.sensors.out.setXTK(nav.xtkToActive, nav.xtkScale);
        this.sensors.out.setObs(obsOut);
        this.sensors.out.setMagvar(magvar);
        this.sensors.out.setDesiredTrack(obsOut);
        this.sensors.out.setWpBearing(this.magvar.trueToMag(nav.bearingToActive, magvar), nav.bearingToActive);
        this.sensors.out.setDistance(nav.distToActive);
        this.sensors.out.setETE(nav.eteToActive);
        this.sensors.out.setPos(this.sensors.in.gps.coords, this.sensors.in.gps.groundspeed, this.sensors.in.gps.getTrackTrueRespectingGroundspeed());
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
