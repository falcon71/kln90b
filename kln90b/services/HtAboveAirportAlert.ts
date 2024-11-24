import {CalcTickable} from "../TickController";
import {NavPageState} from "../data/VolatileMemory";
import {KLN90PlaneSettings} from "../settings/KLN90BPlaneSettings";
import {Facility, FacilityType, ICAO} from "@microsoft/msfs-sdk";
import {Sensors} from "../Sensors";
import {KLN90BUserSettings} from "../settings/KLN90BUserSettings";
import {LONG_BEEP_ID, SHORT_BEEP_ID} from "./AudioGenerator";

/**
 * 3-58
 */
export class HtAboveAirportAlert implements CalcTickable {

    private alerted: Facility | null = null;


    constructor(private navPageState: NavPageState, private settings: KLN90PlaneSettings, private sensors: Sensors, private userSettings: KLN90BUserSettings) {
    }

    public tick(): void {
        const activeWpt = this.navPageState.activeWaypoint.getActiveWpt();
        const indicatedAlt = this.sensors.in.airdata.getIndicatedAlt();
        if (!this.settings.output.altitudeAlertEnabled || indicatedAlt === null || activeWpt === null) {
            return;
        }

        const enabled = this.userSettings.getSetting("htAboveAptEnabled").get();

        if (!enabled || ICAO.getFacilityTypeFromValue(activeWpt.icaoStruct) !== FacilityType.Airport) {
            return;
        }

        const offset = this.userSettings.getSetting("airspaceAlertBuffer").get();


        if (this.navPageState.distToActive! <= 5 && indicatedAlt <= (activeWpt as any).altitude + offset) {
            if (this.alerted !== activeWpt) {
                this.sensors.out.audioGenerator.beepPattern([SHORT_BEEP_ID, LONG_BEEP_ID, SHORT_BEEP_ID]);
                this.alerted = activeWpt;
            }
        } else {
            this.alerted = null;
        }

    }

}