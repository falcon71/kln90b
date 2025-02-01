import {NavPageState} from "../data/VolatileMemory";
import {Sensors} from "../Sensors";
import {CalcTickable} from "../TickController";
import {Flightplan} from "../data/flightplan/Flightplan";
import {Degrees, Feet, NauticalMiles, Seconds} from "../data/Units";
import {Facility, GeoPoint, ICAO, UnitType} from "@microsoft/msfs-sdk";
import {HOURS_TO_SECONDS} from "../data/navdata/NavCalculator";
import {format} from "numerable";

export const enum VnavState {
    Inactive,
    Armed,
    Active
}

export class Vnav implements CalcTickable {

    public state: VnavState = VnavState.Inactive;
    public timeToVnav: Seconds | null = null;
    public advisoryAltitude: Feet | null = null;

    constructor(private readonly navState: NavPageState, private readonly sensors: Sensors, private readonly fpl0: Flightplan) {
    }

    public tick(): void {
        this.advisoryAltitude = null;
        this.timeToVnav = null;
        if (this.navState.nav4VnavWpt === null || !this.isValidVnavWpt(this.navState.nav4VnavWpt)) {
            this.navState.nav4VnavWpt = null;
            this.state = VnavState.Inactive;
            return;
        }

        if (this.state === VnavState.Armed) {
            const distToVnav = this.getDistanceToTarget(this.navState.nav4VnavWpt!) - this.calcDistWithAngle();
            this.timeToVnav = distToVnav / this.sensors.in.gps.groundspeed * HOURS_TO_SECONDS;
            if (this.timeToVnav <= 0) {
                this.state = VnavState.Active;
            }
        }

        if (this.state === VnavState.Active) {
            const distToTarget = this.getDistanceToTarget(this.navState.nav4VnavWpt!);
            this.advisoryAltitude = this.calcAltitude(distToTarget);
            if ((this.navState.nav4VnavAngle! > 0 && this.advisoryAltitude >= this.navState.nav4SelectedAltitude) //climb
                || (this.navState.nav4VnavAngle! < 0 && this.advisoryAltitude <= this.navState.nav4SelectedAltitude)//descend
            ) {
                this.state = VnavState.Inactive;
                return;
            }
        }

    }

    public getVnavWaypoint(): Facility | null {
        return this.navState.nav4VnavWpt ?? this.navState.activeWaypoint.getActiveWpt();
    }

    public getAngle(): Degrees {
        const altFrom = this.sensors.in.airdata.getIndicatedAlt() ?? this.navState.nav4FromAlt;

        if (this.navState.nav4VnavAngle === null) {
            const vnavWpt = this.getVnavWaypoint();
            if (vnavWpt === null) {
                return 0;
            }

            const angle = this.calculateAngle(altFrom, this.navState.nav4SelectedAltitude, this.getDistanceToTarget(vnavWpt));
            if (Math.abs(angle) >= 10) {
                return 0;
            } else {
                return angle;
            }
        } else {
            return this.navState.nav4VnavAngle;
        }
    }

    public armVnav(): void {
        const angle = this.getAngle();
        if (this.state !== VnavState.Armed && angle !== 0) {
            this.navState.nav4VnavAngle = angle;
            this.navState.nav4VnavWpt = this.getVnavWaypoint();
            this.state = VnavState.Armed;
            this.tick();
        }
    }

    public disarmVnav(): void {
        this.navState.nav4VnavAngle = null;
        this.state = VnavState.Inactive;
    }

    /**
     * C-1: Checks if the waypoint is valid for VNAV
     * @param wpt
     */
    public isValidVnavWpt(wpt: Facility): boolean {
        const fplIdx = this.navState.activeWaypoint.getActiveFplIdx();
        const active = this.navState.activeWaypoint.getActiveWpt();
        if (active === null) {
            return false;
        }
        if (fplIdx === -1) { //Direct to, wpt must be the active waypoint
            return ICAO.valueEquals(wpt.icaoStruct, active.icaoStruct)
        } else {
            const isFutureWpt = this.fpl0.getLegs().filter((_, idx) => idx >= fplIdx).some(l => ICAO.valueEquals(l.wpt.icaoStruct, wpt.icaoStruct));
            if (!isFutureWpt) {
                return false;
            }
        }
        return true;
    }

    public formatDuration(duration: Seconds | null): string {
        if (duration === null) {
            return "--:--";
        }

        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;

        if (minutes === 0) {
            return `  :${format(seconds, "00")}`;
        } else {
            return `${minutes.toString().padStart(2, " ")}:${format(seconds, "00")}`;
        }
    }

    /**
     * Returns the distance, the descent needs with the required angle
     * @private
     */
    private calcDistWithAngle() {
        const altFrom = this.sensors.in.airdata.getIndicatedAlt() ?? this.navState.nav4FromAlt;
        const distHeight: NauticalMiles = UnitType.FOOT.convertTo(this.navState.nav4SelectedAltitude - altFrom, UnitType.NMILE);
        return 1 / ((Math.tan(this.navState.nav4VnavAngle! * Avionics.Utils.DEG2RAD) / distHeight));
    }

    /**
     * Returns the advisory altitude at the given distance
     * @param dist
     * @private
     */
    private calcAltitude(dist: NauticalMiles): Feet {
        return this.navState.nav4SelectedAltitude - Math.tan(this.navState.nav4VnavAngle! * Avionics.Utils.DEG2RAD) * UnitType.NMILE.convertTo(dist, UnitType.FOOT);
    }

    /**
     * Calculates the angle to descend in the given distance
     * @param altFrom
     * @param altTo
     * @param distance
     * @private
     */
    private calculateAngle(altFrom: Feet, altTo: Feet, distance: NauticalMiles): Degrees {
        const distHeight: NauticalMiles = UnitType.FOOT.convertTo(altTo - altFrom, UnitType.NMILE);
        return Math.atan(distHeight / distance) * Avionics.Utils.RAD2DEG;
    }

    /**
     * Returns the distance from the current position to the given waypoint.
     * This function assumes, that the WPT is either the active waypoint or it is a future WPT in the FPL.
     * @param target
     * @private
     */
    private getDistanceToTarget(target: Facility): NauticalMiles {
        console.assert(this.isValidVnavWpt(target), "VNAV Wpt is not valid", target);
        const activeWpt = this.navState.activeWaypoint.getActiveWpt()!;
        if (ICAO.valueEquals(activeWpt.icaoStruct, target.icaoStruct)) {
            return this.navState.distToActive! - this.navState.nav4VnavDist;
        } else {
            let dist = this.navState.distToActive! - this.navState.nav4VnavDist;
            const legs = this.fpl0.getLegs();
            const fplIdx = this.navState.activeWaypoint.getActiveFplIdx();
            for (let i = fplIdx + 1; i < legs.length; i++) {
                const prev = legs[i - 1];
                const next = legs[i];
                dist += UnitType.GA_RADIAN.convertTo(new GeoPoint(prev.wpt.lat, prev.wpt.lon).distance(next.wpt), UnitType.NMILE);
                if (ICAO.valueEquals(next.wpt.icaoStruct, target.icaoStruct)) {
                    return dist;
                }
            }
            throw new Error(`VNAV Wpt is not valid${target.icaoStruct}`);
        }
    }
}