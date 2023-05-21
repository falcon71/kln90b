import {CalcTickable, TICK_TIME_CALC} from "../../TickController";
import {
    BitFlags,
    BoundaryAltitudeType,
    BoundaryFacility,
    BoundaryType,
    DefaultLodBoundaryCache,
    FacilitySearchType,
    GeoPoint,
    LodBoundary,
    NearestLodBoundarySearchSession,
    UnitType, UserSetting,
} from "@microsoft/msfs-sdk";
import {KLN90BUserSettings} from "../../settings/KLN90BUserSettings";
import {Sensors} from "../../Sensors";
import {AirspaceAlertMessage, InsideAirspaceMessage, MessageHandler} from "../MessageHandler";
import {KLNFacilityLoader} from "./KLNFacilityLoader";
import {BoundaryUtils} from "./BoundaryUtils";
import {Feet} from "../Units";
import {NavMode, NavPageState} from "../VolatileMemory";

const ALERT_TICK_TIME = 10000;

export const SPECIAL_USE_AIRSPACE_FILTER: number = BitFlags.union(
    BitFlags.createFlag(BoundaryType.ClassB),
    BitFlags.createFlag(BoundaryType.ClassC),
    BitFlags.createFlag(BoundaryType.Alert),
    BitFlags.createFlag(BoundaryType.Danger),
    BitFlags.createFlag(BoundaryType.MOA),
    BitFlags.createFlag(BoundaryType.Prohibited),
    BitFlags.createFlag(BoundaryType.Restricted),
    BitFlags.createFlag(BoundaryType.Training),
    BitFlags.createFlag(BoundaryType.Warning),
    //TODO are missing CTA, TMA and caut
);

/**
 * 3-39
 */
export class AirspaceAlert implements CalcTickable {
    private enabled: UserSetting<boolean>;
    private altBuffer: UserSetting<number>;

    private airspaceSession: NearestLodBoundarySearchSession | undefined;

    private isSearching: boolean = false;

    private readonly nearAirspaces = new Map<number, LodBoundary>(); //All airspaces, that are near the plane
    private warnedAirspaces: LodBoundary[] = []; //All airspaces, the user have been warned of
    private enteredAirspaces: LodBoundary[] = []; //All airspaces we are currently inside


    private tickTimer: number = 0;

    constructor(userSettings: KLN90BUserSettings, private sensors: Sensors, private messageHandler: MessageHandler, private readonly facilityLoader: KLNFacilityLoader, private readonly navState: NavPageState) {
        this.enabled = userSettings.getSetting("airspaceAlertEnabled");
        this.altBuffer = userSettings.getSetting("airspaceAlertBuffer");
    }

    public async init() {
        const session = await this.facilityLoader.startNearestSearchSession(FacilitySearchType.Boundary);


        this.airspaceSession = new NearestLodBoundarySearchSession(DefaultLodBoundaryCache.getCache(), session, 0.5);
        this.airspaceSession.setFilter(
            SPECIAL_USE_AIRSPACE_FILTER,
        );
    }

    public tick(): void {
        this.tickTimer += TICK_TIME_CALC;

        //3-41 Inhibited during approach
        const isApproachmode = this.navState.navmode === NavMode.ARM_LEG || this.navState.navmode === NavMode.ARM_OBS || this.navState.navmode === NavMode.APR_LEG;
        //we run this one only every 10 seconds, because it is very expensive
        if (this.tickTimer < ALERT_TICK_TIME || !this.sensors.in.gps.isValid() || !this.enabled.get() || this.isSearching || !this.airspaceSession || isApproachmode) {
            return;
        }

        this.tickTimer = 0;
        this.refreshAirspaceList();
    }

    /**
     * Reloads the list of airspaces from the simulator
     * @private
     */
    private async refreshAirspaceList(): Promise<void> {
        this.isSearching = true;
        const airspaces = await this.airspaceSession!.searchNearest(this.sensors.in.gps.coords.lat, this.sensors.in.gps.coords.lon, UnitType.METER.convertFrom(100, UnitType.NMILE), 100);
        for (const airspace of airspaces.added) {
            this.nearAirspaces.set(airspace.facility.id, airspace);
        }
        for (const id of airspaces.removed) {
            this.nearAirspaces.delete(id);
        }
        this.isSearching = false;

        this.checkNearAirspaces();
    }

    private checkNearAirspaces() {
        const posIn10Min = this.sensors.in.gps.coords.offset(this.sensors.in.gps.trackTrue, UnitType.NMILE.convertTo(this.sensors.in.gps.groundspeed / 6, UnitType.GA_RADIAN), new GeoPoint(0, 0));
        const indicatedAlt = this.sensors.in.airdata.getIndicatedAlt();

        for (const airspace of this.nearAirspaces.values()) {
            const isVerticallyInside = this.isVerticallyInsideAirspace(airspace.facility, indicatedAlt);
            const isInside = isVerticallyInside && BoundaryUtils.isInside(airspace, this.sensors.in.gps.coords.lat, this.sensors.in.gps.coords.lon);
            //console.log("checking airspace inside", airspace, isVerticallyInside, isInside);
            if (isInside) {
                if (!this.enteredAirspaces.includes(airspace)) {
                    this.enteredAirspaces.push(airspace);
                    this.messageHandler.addMessage(new InsideAirspaceMessage(["INSIDE SPC USE AIRSPACE", ...this.formatAirspaceAlertMessage(airspace.facility)], airspace, this.sensors));
                }

            } else {
                const idxEntered = this.enteredAirspaces.indexOf(airspace);
                if (idxEntered >= 0) {
                    this.enteredAirspaces.splice(idxEntered, 1);
                }


                //TODO this is only the 10 minute rule. We should also check if we are within 2NM
                const warn = isVerticallyInside && BoundaryUtils.intersects(airspace, this.sensors.in.gps.coords.lat, this.sensors.in.gps.coords.lon, posIn10Min.lat, posIn10Min.lon);
                //console.log("checking airspace warning", airspace, isVerticallyInside, warn);

                if (warn) {
                    if (!this.warnedAirspaces.includes(airspace)) {
                        this.warnedAirspaces.push(airspace);
                        this.messageHandler.addMessage(new AirspaceAlertMessage(["AIRSPACE ALERT:", ...this.formatAirspaceAlertMessage(airspace.facility)], airspace, this.sensors));
                    }
                } else {
                    const idxWarn = this.warnedAirspaces.indexOf(airspace);
                    if (idxWarn >= 0) {
                        this.warnedAirspaces.splice(idxWarn, 1);
                    }
                }
            }
        }
    }

    private isVerticallyInsideAirspace(airspace: BoundaryFacility, indicatedAltitude: Feet | null): boolean {
        if (indicatedAltitude === null) {
            return true; //3-40: NOTE: If there is no altitude input to the KLN 90B, all altitudes will be regarded as being within the boundary of the SUA area
        }

        //3-39 MSL is checked. AGL means is treated as GND to unlimited
        if (airspace.minAltType === BoundaryAltitudeType.MSL && indicatedAltitude < UnitType.METER.convertTo(airspace.minAlt, UnitType.FOOT) - this.altBuffer.get()) {
            return false;
        }

        // noinspection RedundantIfStatementJS
        if (airspace.maxAltType === BoundaryAltitudeType.MSL && indicatedAltitude > UnitType.METER.convertTo(airspace.minAlt, UnitType.FOOT) + this.altBuffer.get()) {
            return false;
        }

        return true;
    }

    private formatAirspaceAlertMessage(airspace: BoundaryFacility): string[] {
        const type = formatAirspaceTypeName(airspace.type);
        const maxStringlength = 22 - type.length; //Messages are intended
        const name = airspace.name.substring(0, maxStringlength - 1).padEnd(maxStringlength) + type;

        const lowLimit = airspace.minAltType === BoundaryAltitudeType.MSL ? Math.round(UnitType.METER.convertTo(airspace.minAlt, UnitType.FOOT)) : null;
        const highLimit = airspace.maxAltType === BoundaryAltitudeType.MSL ? Math.round(UnitType.METER.convertTo(airspace.maxAlt, UnitType.FOOT)) : null;

        let altString = "";
        if (lowLimit !== null && highLimit !== null) {
            altString = `${lowLimit.toString()}ft to ${highLimit.toString()}ft`;
        } else if (lowLimit !== null) {
            altString = `ABOVE ${lowLimit.toString()}ft`;
        } else if (highLimit !== null) {
            altString = `BELOW ${highLimit.toString()}ft`;
        }

        return altString === "" ? [name] : [name, altString];
    }

}

export function formatAirspaceTypeName(type: BoundaryType): string {
    switch (type) {
        case BoundaryType.ClassB:
            return "CL B";
        case BoundaryType.ClassC:
            return "CL C";
        case BoundaryType.Alert:
            return "ALRT";
        case BoundaryType.Danger:
            return "DNGR";
        case BoundaryType.MOA:
            return "MOA";
        case BoundaryType.Prohibited:
            return "PROH";
        case BoundaryType.Restricted:
            return "REST";
        case BoundaryType.Training:
            return "TRNG";
        case BoundaryType.Warning:
            return "WARN";
        default:
            return "";
    }
}