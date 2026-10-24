import {AirportFacility, EventBus, ExtendedApproachType, Facility, Publisher} from "@microsoft/msfs-sdk";
import {ArcData} from "../navdata/SidStar";

export const enum KLNLegType {
    USER, //Anything that could be entered by the user. Allows editing
    SID,
    STAR,
    APP, //No editing allowed
}

export const enum KLNFixType {
    IAF,
    FAF,
    MAP,
    MAHP,
}

export interface ProcedureInformation {
    readonly displayName: string,
    readonly procedureName: string,
    readonly approachSuffix?: string,
    readonly approachType?: ExtendedApproachType,
    readonly transition?: string,
    readonly runwayNumber?: number,
    readonly runwayDesignator?: RunwayDesignator,
}

export interface KLNFlightplanLeg {
    wpt: Facility,
    readonly type: KLNLegType,
    readonly parentFacility?: AirportFacility,
    readonly procedure?: ProcedureInformation,
    readonly flyOver?: boolean,
    readonly fixType?: KLNFixType,
    readonly askObs?: boolean,
    arcData?: ArcData,
}


export interface FlightplanEvents {
    flightplanChanged: Flightplan;
}

/**
 * The most en-route waypoints a flight plan holds (4-1, 4-4). A numbered plan holds only en-route waypoints, so this
 * is its whole size.
 */
export const MAX_LEGS = 30;

/**
 * #221: the most legs FPL 0 holds with its SID, STAR and approach legs, which come on top of the en-route limit (the
 * KLN 89 does the same with 20 and 35, checked in its trainer on 2026-10-15). The 90B gives no total; 45 keeps the
 * 89's room of 15 for procedures (maintainer ruling)
 */
export const MAX_FPL0_LEGS = 45;

/** #221: the en-route legs, the ones the pilot enters (procedure legs are SID, STAR, APP) */
export function countEnRouteLegs(legs: KLNFlightplanLeg[]): number {
    return legs.filter(leg => leg.type === KLNLegType.USER).length;
}

/**
 * #221: whether a plan with these legs takes `enRoute` more en-route legs and `procedure` more procedure legs.
 * FPL 0 (`fplIdx` 0) has both limits, a numbered plan only its size.
 */
export function legsFit(fplIdx: number, legs: KLNFlightplanLeg[], enRoute: number, procedure: number): boolean {
    const total = legs.length + enRoute + procedure;
    if (fplIdx !== 0) {
        return total <= MAX_LEGS;
    }
    return countEnRouteLegs(legs) + enRoute <= MAX_LEGS && total <= MAX_FPL0_LEGS;
}

/**
 * We don't use the WT Flighplan, because the KLN Flightplan really is dead simple
 */
export class Flightplan {
    private readonly publisher: Publisher<FlightplanEvents>;
    private publishingEnabled = true;


    constructor(public readonly idx: number, private legs: KLNFlightplanLeg[], bus: EventBus) {
        this.publisher = bus.getPublisher<FlightplanEvents>();
    }

    /** #221: whether this plan takes `enRoute` more en-route and `procedure` more procedure legs */
    public fits(enRoute: number, procedure: number): boolean {
        return legsFit(this.idx, this.legs, enRoute, procedure);
    }

    /**
     * Don't call this directly, use insertLegIntoFpl
     * @param idx
     * @param leg
     */
    public insertLeg(idx: number, leg: KLNFlightplanLeg) {
        const enRoute = leg.type === KLNLegType.USER ? 1 : 0;
        if (!this.fits(enRoute, 1 - enRoute)) {
            throw new Error(`Cannot have more than ${MAX_LEGS} legs!`);
        }
        this.legs.splice(idx, 0, leg);
        if (this.publishingEnabled) {
            this.publisher.pub("flightplanChanged", this);
        }
    }

    /**
     * Starts a batch insert of multiple waypoints. Prevents multiple event publishes.
     * Would mess up the async asobo FPL sync
     */
    public startBatchInsert() {
        this.publishingEnabled = false;
    }

    public finishBatchInsert() {
        this.publisher.pub("flightplanChanged", this);
        this.publishingEnabled = true;
    }

    /**
     * 6-17: replaces the entry of the DME arc at `idx`, when MOVE ? has moved it. The leg changes in place, so the active
     * waypoint, which holds the leg object, sees the new entry. Publishes like insertLeg, so that the flight planner mirror
     * follows (#419); inside a batch it does not
     */
    public setArcEntry(idx: number, arcData: ArcData): void {
        const leg = this.legs[idx];
        leg.arcData = arcData;
        leg.wpt = arcData.entryFacility;
        if (this.publishingEnabled) {
            this.publisher.pub("flightplanChanged", this);
        }
    }

    public deleteLeg(idx: number) {
        this.legs.splice(idx, 1);
        if (this.publishingEnabled) {
            this.publisher.pub("flightplanChanged", this);
        }
    }

    public getLegs(): KLNFlightplanLeg[] {
        return this.legs;
    }

    public delete(): void {
        this.legs = [];
        if (this.publishingEnabled) {
            this.publisher.pub("flightplanChanged", this);
        }
    }

    /**
     * Removes all approaches, SIDs and STARs from this flightplan.
     * Occurs when the device was powered off for more than 5 minutes. Copying FPL 0 does not call it, as `load`
     * filters the procedure legs itself
     */
    public removeProcedures(): void {
        this.removeLegs(leg => leg.type !== KLNLegType.USER);
    }

    public removeProcedure(type: KLNLegType): void {
        this.removeLegs(leg => leg.type === type);
    }

    /**
     * #347: removes the legs and publishes, so that the flight planner mirror follows. Only when legs went: a publish at
     * every power-on would rebuild the SDK planner for nothing. Inside a batch (startBatchInsert, #222, the procedure
     * loads of APT 7 and 8) it does not publish: finishBatchInsert publishes once for the whole batch
     */
    private removeLegs(predicate: (leg: KLNFlightplanLeg) => boolean): void {
        const kept = this.legs.filter(leg => !predicate(leg));
        if (kept.length === this.legs.length) {
            return;
        }
        this.legs = kept;
        if (this.publishingEnabled) {
            this.publisher.pub("flightplanChanged", this);
        }
    }

    public load(fpl: Flightplan) {
        this.legs = fpl.legs.filter(leg => leg.type === KLNLegType.USER);
        this.publisher.pub("flightplanChanged", this);
    }

    public loadInverted(fpl: Flightplan) {
        this.legs = [...fpl.legs];
        this.legs.reverse();
        this.publisher.pub("flightplanChanged", this);
    }

}