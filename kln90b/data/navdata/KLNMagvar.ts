import {Facility, FacilityType, FacilityUtils, LatLonInterface, MagVar, VorFacility} from "@microsoft/msfs-sdk";
import {Degrees} from "../Units";
import {CalcTickable} from "../../TickController";
import {Sensors} from "../../Sensors";
import {NavPageState} from "../VolatileMemory";

export class KLNMagvar implements CalcTickable {

    private dbMagvar: number = 0;
    private lat: number = 0;


    constructor(private readonly sensors: Sensors, private readonly navState: NavPageState) {
    }


    /**
     * 5-44
     */
    public isMagvarValid() {
        return this.lat <= 74 && this.lat >= -60;
    }

    public trueToMag(tru: Degrees, magvar?: number): Degrees;
    public trueToMag(tru: Degrees | null, magvar?: number): Degrees | null;
    public trueToMag(tru: Degrees | null, magvar: number = this.getCurrentMagvar()): Degrees | null {
        if (tru === null) {
            return null;
        }
        return MagVar.trueToMagnetic(tru, magvar);
    }

    public magToTrue(mag: Degrees, magvar: number = this.getCurrentMagvar()): Degrees {
        return MagVar.magneticToTrue(mag, magvar);
    }

    /**
     * The variation that turns a true radial from a reference into the magnetic radial the unit shows, east positive.
     * A VOR (database or user) uses its own published variation; any other waypoint the variation model at its position.
     * Checked in the KLN 89 trainer, 2026-10-07 (VOR, #280) and 2026-10-12 (airport, NDB, intersection, user waypoint)
     */
    public static getReferenceMagvar(ref: Facility): number {
        if (FacilityUtils.isFacilityType(ref, FacilityType.VOR)) {
            return -(ref as VorFacility).magneticVariation; //The sim stores a VOR's variation with west positive (Nav2Page)
        }
        return MagVar.get(ref);
    }

    public getCurrentMagvar(): number {
        return this.isMagvarValid() ? this.dbMagvar : this.navState.userMagvar;
    }

    public getMagvarForCoordinates(coords: LatLonInterface): number {
        return MagVar.get(coords);
    }


    public tick(): void {
        const coords = this.sensors.in.gps.coords;
        this.lat = coords.lat;
        if (this.isMagvarValid()) {
            this.dbMagvar = MagVar.get(coords);
            this.navState.userMagvar = 0; //Let's reset this to true north every time we cross 74°
        }
    }


}