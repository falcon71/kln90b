import {FROM, NavMode, NavPageState} from "../data/VolatileMemory";
import {
    AirportFacility,
    BitFlags,
    EventBus,
    Facility,
    FacilityType,
    FixTypeFlags,
    FlightPlan,
    FlightPlanSegmentType,
    GeoPoint,
    ICAO,
    LatLonInterface,
    LegDefinition,
    NavMath,
    UnitType,
    UserFacilityUtils,
    VorFacility,
} from "@microsoft/msfs-sdk";
import {KLN90PlaneSettings} from "../settings/KLN90BPlaneSettings";
import {Sensors} from "../Sensors";
import {Degrees} from "../data/Units";
import {StatusLineMessageEvents} from "../controls/StatusLine";
import {CalcTickable, TICK_TIME_CALC} from "../TickController";
import {KLNMagvar} from "../data/navdata/KLNMagvar";
import {getSegment} from "./FlightplanUtils";
import {AccessUserData} from "../data/flightplan/AccesUserData";

/**
 * 5-36
 */
export class ModeController implements CalcTickable {


    constructor(private readonly bus: EventBus, private readonly navState: NavPageState, private readonly fpl0: FlightPlan, private readonly planeSettings: KLN90PlaneSettings, private readonly sensors: Sensors, private readonly magvar: KLNMagvar) {
    }


    public armApproachPressed() {
        let apt: AirportFacility | null;
        switch (this.navState.navmode) {
            case NavMode.ENR_LEG:
                apt = this.getApproachApt();
                if (apt === null) {
                    this.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "NO APPROACH");
                } else {
                    this.navState.navmode = NavMode.ARM_LEG;
                    if (UnitType.GA_RADIAN.convertTo(this.sensors.in.gps.coords.distance(apt), UnitType.NMILE) <= 30) {
                        this.navState.xtkScale = 1;
                    }
                }
                break;
            case NavMode.ARM_LEG:
                this.navState.navmode = NavMode.ENR_LEG;
                this.navState.xtkScale = 5;
                break;
            case NavMode.ENR_OBS:
                apt = this.getApproachApt();
                if (apt === null) {
                    this.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "NO APPROACH");
                } else {
                    this.navState.navmode = NavMode.ARM_OBS;
                    if (UnitType.GA_RADIAN.convertTo(this.sensors.in.gps.coords.distance(apt), UnitType.NMILE) <= 30) {
                        this.navState.xtkScale = 1;
                    }
                }
                break;
            case NavMode.ARM_OBS:
                this.navState.navmode = NavMode.ENR_OBS;
                this.navState.xtkScale = 5;
                break;
            case NavMode.APR_LEG:
                this.navState.navmode = NavMode.ARM_LEG;
                this.navState.xtkScale = 1;
                break;

        }
    }

    /**
     * 6-3 Approach gets deactivated when performing direct to
     */
    public deactivateApproach() {
        if (this.navState.navmode !== NavMode.APR_LEG) {
            return;
        }

        this.navState.navmode = NavMode.ARM_LEG;
        this.navState.xtkScale = 1;
    }

    /**
     * 5-36 When the user switched to ENR-LEG via the MOD 1 page
     */
    public switchToEnrLegMode() {
        this.navState.navmode = this.navState.navmode === NavMode.ARM_OBS ? NavMode.ARM_LEG : NavMode.ENR_LEG;

        const active = this.navState.activeWaypoint.getActiveWpt();
        if (active !== null) {
            if (this.navState.toFrom === FROM) {
                const from = UserFacilityUtils.createFromLatLon("UXX        d", this.sensors.in.gps.coords.lat, this.sensors.in.gps.coords.lon, true);
                const to = this.navState.activeWaypoint.activateFpl0();
                if (to !== null) {
                    this.navState.activeWaypoint.directTo(from, to);
                }
            } else {
                //todo not sure this is right. We need rule 2, the OBS bekoes the DTK
                const fromCoords: LatLonInterface = this.navState.activeWaypoint.getFromWpt()!;
                const from = UserFacilityUtils.createFromLatLon("UXX        d", fromCoords.lat, fromCoords.lon, true);
                this.navState.activeWaypoint.directTo(from, active);
            }
        }
    }

    /**
     * 5-36 When the user switched to ENR-LEG via the MOD 2 page
     */
    public switchToEnrObsMode() {
        const active = this.navState.activeWaypoint.getActiveWpt();
        if (active === null) {
            this.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "NO ACTV WPT");
        } else {
            this.forceSwitchToEnrObsMode();
        }
    }

    /**
     * When the user switches the mode via an external switch.
     * TODO: What happens if there is no active waypoint? Is the warning screen from 3-7 only shown during startup or
     * also during normal operation?
     * @param isObsActive
     */
    public setExternalObsMode(isObsActive: boolean) {
        if (isObsActive === this.isObsModeActive()) {
            return;
        }

        if (isObsActive) {
            const active = this.navState.activeWaypoint.getActiveWpt();
            if (active === null) {
                //We cann tell the status line in the warning screen from 3-7 that the device does indeed enter OBS-LEG
                // mode without a waypoint
                this.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "NO ACTV WPT")
            }
            this.forceSwitchToEnrObsMode();
        } else {
            this.switchToEnrLegMode();
        }

    }

    private forceSwitchToEnrObsMode() {
        const active = this.navState.activeWaypoint.getActiveWpt();

        if (this.navState.navmode === NavMode.APR_LEG) {
            //6-3 Switching to OBS cancels an active approach
            this.navState.navmode = NavMode.ARM_OBS;
            this.navState.xtkScale = 1;
        } else {
            this.navState.navmode = this.navState.navmode === NavMode.ARM_LEG ? NavMode.ARM_OBS : NavMode.ENR_OBS;
        }

        if (this.sensors.in.obsMag !== null && this.planeSettings.output.obsTarget === 0) {
            this.setObs(this.sensors.in.obsMag);
        } else if (active !== null) {
            const obsTrue = this.navState.desiredTrack!;
            const magvar = this.getMagvarForObs(active);
            this.setObs(this.magvar.trueToMag(obsTrue, magvar));
        }
    }

    public isObsModeActive(): boolean {
        return this.navState.navmode === NavMode.ENR_OBS || this.navState.navmode === NavMode.ARM_OBS;
    }

    public getDtkOrObsMagnetic(): number | null {
        if (this.isObsModeActive()) {
            return this.navState.obsMag;
        }
        return this.magvar.trueToMag(this.navState.desiredTrack);
    }

    public getDtkOrObsTrue(): number | null {
        if (this.isObsModeActive()) {
            return this.getObsTrue();
        }
        if (this.navState.desiredTrack === null) {
            return null;
        }

        return this.navState.desiredTrack;
    }

    public getObsTrue(): number {
        const toWpt = this.navState.activeWaypoint.getActiveWpt();
        const magvar = this.getMagvarForObs(toWpt);
        return this.magvar.magToTrue(this.navState.obsMag, magvar);
    }

    public getMagvarForObs(wpt: Facility | null) {
        if (wpt !== null && ICAO.getFacilityType(wpt.icao) === FacilityType.VOR) {
            return -(wpt as VorFacility).magneticVariation; //Seems to be opposite to the magvar service
        }
        return this.magvar.getCurrentMagvar();
    }

    public setObs(obsMag: Degrees): void {
        if (obsMag === this.navState.obsMag) {
            return;
        }

        this.navState.obsMag = obsMag;
        const active = this.navState.activeWaypoint.getActiveWpt();
        if (active === null) {
            return;
        }
        const toPoint = new GeoPoint(active.lat, active.lon);
        const bearing = this.getObsTrue() - 180;

        toPoint.offset(bearing, UnitType.NMILE.convertTo(1000, UnitType.GA_RADIAN));
        const from = UserFacilityUtils.createFromLatLon("UXX         ", toPoint.lat, toPoint.lon, true);
        this.navState.activeWaypoint.directTo(from, active);
    }

    public tick(): void {
        const apt = this.getApproachApt();
        switch (this.navState.navmode) {
            case NavMode.ENR_LEG:
                this.checkSwitchEnrToArmMode(apt);
                break;
            case NavMode.ENR_OBS:
                this.checkSwitchEnrToArmMode(apt);
                const obsIn = this.sensors.in.obsMag;
                if (obsIn !== null) {
                    this.setObs(obsIn);
                }
                break;
            case NavMode.ARM_LEG:
                if (apt === null) {
                    this.navState.navmode = NavMode.ENR_LEG;
                    this.navState.xtkScale = 5;
                } else {
                    this.adjustXtkScaleArm(apt);
                    this.checkSwitchAprArmToActive();
                }
                break;
            case NavMode.ARM_OBS:
                if (apt === null) {
                    this.navState.navmode = NavMode.ENR_OBS;
                    this.navState.xtkScale = 5;
                } else {
                    this.adjustXtkScaleArm(apt);
                    const obsIn = this.sensors.in.obsMag;
                    if (obsIn !== null) {
                        this.setObs(obsIn);
                    }
                }
                break;
            case NavMode.APR_LEG:
                if (apt === null) {
                    this.navState.navmode = NavMode.ENR_LEG;
                    this.navState.xtkScale = 5;
                } else {
                    const map = this.getApproachMapIfAhead();
                    if (map === null) {
                        //This shouldn't really happen, but users are evil so better check...
                        console.warn("MAP not found, switching to arm", this.navState.activeWaypoint.getActiveFplIdx(), this.fpl0);
                        this.navState.xtkScale = 1;
                        this.navState.navmode = NavMode.ARM_LEG;
                    }

                    this.adjustXtkScaleActive();
                }
                break;
        }
    }

    private checkSwitchEnrToArmMode(apt: AirportFacility | null): void {
        if (apt !== null && UnitType.GA_RADIAN.convertTo(this.sensors.in.gps.coords.distance(apt), UnitType.NMILE) <= 30) {
            console.log("Moving to Arm mode");
            this.navState.navmode = this.navState.navmode === NavMode.ENR_OBS ? NavMode.ARM_OBS : NavMode.ARM_LEG;
        }
    }

    private adjustXtkScaleArm(apt: AirportFacility): void {
        if (this.navState.xtkScale <= 1 || UnitType.GA_RADIAN.convertTo(this.sensors.in.gps.coords.distance(apt), UnitType.NMILE) > 30) {
            return;
        }

        this.fpl0.directToData

        //Scale moves to 1 in 30 seconds
        const scaleStep = 4 / 30 / 1000 * TICK_TIME_CALC;

        this.navState.xtkScale = Math.max(this.navState.xtkScale - scaleStep, 1);
    }

    private adjustXtkScaleActive(): void {
        if (this.navState.xtkScale == 0.3) {
            return;
        }

        const faf = this.navState.activeWaypoint.getActiveLeg();
        if (BitFlags.isAll(faf?.leg.fixTypeFlags ?? 0, FixTypeFlags.FAF)) {
            this.navState.xtkScale = 0.3;
            return; //We moved on the MAP already
        }

        const dist = UnitType.GA_RADIAN.convertTo(this.sensors.in.gps.coords.distance(AccessUserData.getFacility(faf!)), UnitType.NMILE);
        this.navState.xtkScale = dist * 0.35 + 0.3;  //Scale reaches 0.3 at 0 distance
    }

    private checkSwitchAprArmToActive(): void {
        if (this.navState.navmode !== NavMode.ARM_LEG) {
            return; //No transition for OBS
        }

        const faf = this.navState.activeWaypoint.getActiveLeg();
        if (BitFlags.isAll(faf?.leg.fixTypeFlags ?? 0, FixTypeFlags.FAF)) {
            return; //Only when FAF is active
        }
        if (UnitType.GA_RADIAN.convertTo(this.sensors.in.gps.coords.distance(faf!.leg.lat!, faf!.leg.lon!), UnitType.NMILE) > 2) {
            return; //Within 2 NM
        }

        //Integrity check?

        const map = this.getApproachMapIfAhead();
        if (map === null) {
            //Problem with the navdata?
            return;
        }

        const fafPoint = new GeoPoint(faf!.leg.lat!, faf!.leg.lon!);
        const appDtk = fafPoint.bearingTo(AccessUserData.getFacility(map));

        if (Math.abs(NavMath.diffAngle(appDtk, this.sensors.in.gps.trackTrue)) > 110) {
            return; //Heading towards FAF
        }

        console.log("Moving to Apr mode");
        //If all this has passed, we switch to approach active
        this.navState.navmode = NavMode.APR_LEG;
    }


    /**
     * If there is an approach in the Flightplan, then this will return the corresponding airport. Null otherwise
     */
    private getApproachApt(): AirportFacility | null {
        const appSegment = getSegment(this.fpl0, FlightPlanSegmentType.Approach);
        if (appSegment === null) {
            return null;
        }

        return AccessUserData.getParentFacility(appSegment.legs[0]);
    }

    /**
     * Returns the MAP, but only if it is still ahead of the plane
     * @private
     */
    private getApproachMapIfAhead(): LegDefinition | null {
        return this.fpl0.findLeg(leg => BitFlags.isAll(leg.leg.fixTypeFlags, FixTypeFlags.MAP), false, this.navState.activeWaypoint.getActiveFplIdx());
    }
}