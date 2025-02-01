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
 * We don't use the WT Flighplan, because the KLN Flightplan really is dead simple
 */
export class Flightplan {
    private readonly publisher: Publisher<FlightplanEvents>;
    private publishingEnabled = true;


    constructor(public readonly idx: number, private legs: KLNFlightplanLeg[], bus: EventBus) {
        this.publisher = bus.getPublisher<FlightplanEvents>();
    }

    /**
     * Don't call this directly, use insertLegIntoFpl
     * @param idx
     * @param leg
     */
    public insertLeg(idx: number, leg: KLNFlightplanLeg) {
        if (this.legs.length >= 30) {
            throw new Error("Cannot have more than 30 legs!");
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
    }

    /**
     * Removes all approaches, SIDs and STARs from this flightplan.
     * Occurs when copying FPL 0 or when the device was powered off for more than 5 minutes
     */
    public removeProcedures(): void {
        this.legs = this.legs.filter(leg => leg.type === KLNLegType.USER);
    }

    public removeProcedure(type: KLNLegType): void {
        this.legs = this.legs.filter(leg => leg.type !== type);
    }

    public load(fpl: Flightplan) {
        this.legs = [...fpl.legs];
        this.removeProcedures();
        this.publisher.pub("flightplanChanged", this);
    }

    public loadInverted(fpl: Flightplan) {
        this.legs = [...fpl.legs];
        this.legs.reverse();
        this.publisher.pub("flightplanChanged", this);
    }

}