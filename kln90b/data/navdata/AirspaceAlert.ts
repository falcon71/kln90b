import {CalcTickable, TICK_TIME_CALC} from "../../TickController";
import {
    BitFlags,
    BoundaryAltitudeType,
    BoundaryFacility,
    BoundaryType,
    DefaultLodBoundaryCache,
    FacilityClient,
    FacilitySearchType,
    GeoPoint,
    NearestBoundarySearchSession,
    NearestLodBoundarySearchSession,
    UnitType,
    UserSetting,
} from "@microsoft/msfs-sdk";
import {KLN90BUserSettings} from "../../settings/KLN90BUserSettings";
import {Sensors} from "../../Sensors";
import {AirspaceAlertMessage, InsideAirspaceMessage, MessageHandler} from "../MessageHandler";
import {AirspaceAreas} from "./AirspaceAreas";
import {BoundaryUtils} from "./BoundaryUtils";
import {Feet} from "../Units";
import {NavMode, NavPageState} from "../VolatileMemory";

const ALERT_TICK_TIME = 10000;

/** 3-40, B-1: the alert is also given when the aircraft is this close to the area, in NM */
const ALERT_DISTANCE_NM = 2;

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

    private readonly nearAirspaces = new AirspaceAreas(); //All areas, that are near the plane, one per group of copies (#410)
    //The areas the user is warned of and the areas we are inside, each with its message, live on navState, reset at power-on (#412)

    private tickTimer: number = 0;

    constructor(userSettings: KLN90BUserSettings, private sensors: Sensors, private messageHandler: MessageHandler, private readonly facilityLoader: FacilityClient, private readonly navState: NavPageState) {
        this.enabled = userSettings.getSetting("airspaceAlertEnabled");
        this.altBuffer = userSettings.getSetting("airspaceAlertBuffer");
    }

    public async init() {
        const session = await this.facilityLoader.startNearestSearchSessionWithIcaoStructs(FacilitySearchType.Boundary) as NearestBoundarySearchSession;


        this.airspaceSession = new NearestLodBoundarySearchSession(DefaultLodBoundaryCache.getCache(), session, 0.5);
        this.airspaceSession.setFilter(
            SPECIAL_USE_AIRSPACE_FILTER,
        );
    }

    public tick(): void {
        this.tickTimer += TICK_TIME_CALC;

        //3-41 Inhibited during approach
        const isApproachmode = this.navState.navmode === NavMode.ARM_LEG || this.navState.navmode === NavMode.ARM_OBS || this.navState.navmode === NavMode.APR_LEG;
        if (!this.enabled.get() || isApproachmode) {
            //#412: the open messages go with their areas, and the first check after the alert is back posts them anew
            this.navState.airspaceWarned.clear();
            this.navState.airspaceEntered.clear();
        }
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
            this.nearAirspaces.add(airspace);
        }
        for (const id of airspaces.removed) {
            this.nearAirspaces.remove(id);
        }
        this.isSearching = false;

        this.checkNearAirspaces();
    }

    private checkNearAirspaces() {
        const posIn10Min = this.sensors.in.gps.coords.offset(this.sensors.in.gps.trackTrue, UnitType.NMILE.convertTo(this.sensors.in.gps.groundspeed / 6, UnitType.GA_RADIAN), new GeoPoint(0, 0));
        const indicatedAlt = this.sensors.in.airdata.getIndicatedAlt();

        const areas = this.nearAirspaces.areas();
        const warned = this.navState.airspaceWarned;
        const entered = this.navState.airspaceEntered;

        //#412: an area that left the search entirely is neither warned of nor entered any more; its key would keep its
        //message valid for good
        const keys = new Set<string>();
        for (const airspace of areas) {
            keys.add(this.nearAirspaces.keyOf(airspace));
        }
        for (const key of warned.keys()) {
            if (!keys.has(key)) {
                warned.delete(key);
            }
        }
        for (const key of entered.keys()) {
            if (!keys.has(key)) {
                entered.delete(key);
            }
        }

        for (const airspace of areas) {
            const key = this.nearAirspaces.keyOf(airspace);
            const isVerticallyInside = this.isVerticallyInsideAirspace(airspace.facility, indicatedAlt);
            const isInside = isVerticallyInside && BoundaryUtils.isInside(airspace, this.sensors.in.gps.coords.lat, this.sensors.in.gps.coords.lon);
            //console.log("checking airspace inside", airspace, isVerticallyInside, isInside);
            if (isInside) {
                //#412: entering ends the alert of the area (AVsoftech trainer, 2026-10-22), so leaving it within 2 NM alerts again
                warned.delete(key);
                //#412: a message that the live position has dropped since it was posted is posted anew
                if (!entered.get(key)?.isConditionValid()) {
                    const message = new InsideAirspaceMessage(["INSIDE SPC USE AIRSPACE", ...this.formatAirspaceAlertMessage(airspace.facility)], airspace, key, this.sensors, this.navState);
                    entered.set(key, message);
                    this.messageHandler.addMessage(message);
                }

            } else {
                entered.delete(key);


                //3-40, B-1: the alert comes when the track of the next 10 minutes meets the area, or when the area is within 2 NM
                const warn = isVerticallyInside && (
                    BoundaryUtils.intersects(airspace, this.sensors.in.gps.coords.lat, this.sensors.in.gps.coords.lon, posIn10Min.lat, posIn10Min.lon)
                    || BoundaryUtils.distanceToBoundaryNm(airspace, this.sensors.in.gps.coords.lat, this.sensors.in.gps.coords.lon) <= ALERT_DISTANCE_NM
                );
                //console.log("checking airspace warning", airspace, isVerticallyInside, warn);

                if (warn) {
                    //#412: a message that the live position has dropped since it was posted is posted anew
                    if (!warned.get(key)?.isConditionValid()) {
                        const message = new AirspaceAlertMessage(["AIRSPACE ALERT:", ...this.formatAirspaceAlertMessage(airspace.facility)], airspace, key, this.sensors, this.navState);
                        warned.set(key, message);
                        this.messageHandler.addMessage(message);
                    }
                } else {
                    warned.delete(key);
                }
            }
        }
    }

    private isVerticallyInsideAirspace(airspace: BoundaryFacility, indicatedAltitude: Feet | null): boolean {
        if (indicatedAltitude === null) {
            return true; //3-40: NOTE: If there is no altitude input to the KLN 90B, all altitudes will be regarded as being within the boundary of the SUA area
        }

        //3-39 MSL is checked. AGL means is treated as GND to unlimited
        if (!isCylinder(airspace) && airspace.minAltType === BoundaryAltitudeType.MSL && indicatedAltitude < UnitType.METER.convertTo(airspace.minAlt, UnitType.FOOT) - this.altBuffer.get()) {
            return false;
        }

        // noinspection RedundantIfStatementJS
        if (airspace.maxAltType === BoundaryAltitudeType.MSL && indicatedAltitude > UnitType.METER.convertTo(airspace.maxAlt, UnitType.FOOT) + this.altBuffer.get()) {
            return false;
        }

        return true;
    }

    private formatAirspaceAlertMessage(airspace: BoundaryFacility): string[] {
        const type = formatAirspaceTypeName(airspace.type);
        const maxStringlength = 22 - type.length; //Messages are intended
        const name = airspace.name.substring(0, maxStringlength - 1).padEnd(maxStringlength) + type;

        //#352, figure 3-126: a cylinder shows its upper limit only
        const lowLimit = !isCylinder(airspace) && airspace.minAltType === BoundaryAltitudeType.MSL ? Math.round(UnitType.METER.convertTo(airspace.minAlt, UnitType.FOOT)) : null;
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

/**
 * 3-40: Class B and C are stored by their outer lateral boundary as a cylinder, so every altitude below the upper
 * limit counts as inside (#352)
 */
function isCylinder(airspace: BoundaryFacility): boolean {
    return airspace.type === BoundaryType.ClassB || airspace.type === BoundaryType.ClassC;
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