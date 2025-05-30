import {Facility, FacilityClient, ICAO, IcaoValue} from "@microsoft/msfs-sdk";
import {PageProps} from "../Page";
import {SixLineHalfPage} from "../FiveSegmentPage";
import {WaypointPageState} from "../../data/VolatileMemory";
import {MAX_SCROLL_SPEED, Scanlist} from "../../data/navdata/Scanlist";
import {AirportNearestList, NdbNearestList, NearestWpt, VorNearestList} from "../../data/navdata/NearestList";
import {NearestSelector} from "../../controls/selects/NearestSelector";
import {buildIcaoStructIdentOnly, TEMPORARY_WAYPOINT, USER_WAYPOINT} from "../../data/navdata/IcaoBuilder";

type ScrollDirection = -1 | 1;

const SPEEDSTEP = 350;
const SPEEDSTEP_SIZE = 1.5;

/**
 * 3-21
 * The faster the know is rotated, the faster the rate of scanning. We only receive single events, so we base the speed
 * on the rate of events in a timeframe. In other words, the speed increases, the longer the knob is held.
 */
class ScanHandler {

    public isSearchRunning: boolean = false;
    //todo we could use InputAcceleration from the sdk for this
    private lastScrollTime: number = 0;
    private lastScrollSpeed: number = 1;
    private lastScrollDirection: ScrollDirection = 1;

    constructor(private scanList: Scanlist, private facilityLoader: FacilityClient) {
    }

    public async scanLeft(lastIcao: IcaoValue): Promise<Facility | null> {
        return this.scan(lastIcao, -1);
    }

    public async scanRight(lastIcao: IcaoValue): Promise<Facility | null> {
        return this.scan(lastIcao, 1);
    }

    private getScrollSpeed(direction: ScrollDirection): number {
        let speed: number = 1;
        const now = Date.now();
        if (this.lastScrollDirection === direction && now - this.lastScrollTime <= SPEEDSTEP) {
            speed = this.lastScrollSpeed * SPEEDSTEP_SIZE;
        }

        console.log("Scroll: ", now - this.lastScrollTime, speed);

        this.lastScrollDirection = direction;
        this.lastScrollTime = now;
        this.lastScrollSpeed = Math.min(speed, MAX_SCROLL_SPEED);
        return Math.min(Math.floor(speed), MAX_SCROLL_SPEED) * direction;
    }

    private async scan(lastIcao: IcaoValue, direction: ScrollDirection): Promise<Facility | null> {
        const scrollSpeed = this.getScrollSpeed(direction); //We always want to execute this, so we still have the correct speed
        if (this.isSearchRunning) {
            throw new Error("I'm already scanning, you are calling me too fast!");
        }
        this.isSearchRunning = true;
        const nextIcao = await this.scanList.getNext(lastIcao, scrollSpeed);

        if (nextIcao === null) {
            this.isSearchRunning = false;
            return null
        }
        const nextFacility = await this.facilityLoader.getFacility(ICAO.getFacilityTypeFromValue(nextIcao), nextIcao) as any;

        this.isSearchRunning = false;
        return nextFacility;
    }
}

export abstract class WaypointPage<T extends Facility> extends SixLineHalfPage {
    public facility: T | NearestWpt<T> | null;
    protected ident: string;
    //-1 if this is not an ACT page
    protected activeIdx: number;
    private scanHandler: ScanHandler;

    protected constructor(props: PageProps) {
        super(props);

        if (isWaypointPageProps<T>(props)) {
            if (isNearestWpt(props.facility)) {
                //3-23 This branch can only occur, when the nearest emergency airport is shown. In this case we must update the memory location
                this.facility = props.facility;
                this.getMemory().facility = props.facility;
                const facility = unpackFacility(this.facility);
                this.ident = facility.icaoStruct.ident;
                this.getMemory().ident = this.ident;
                this.getScanlist().sync(facility.icaoStruct);
            } else { //This branch occurs, when the page is shown temporarily for confirmation or in the ACT page. We do not want to set the memory location
                this.facility = props.facility;
                if (this.facility === null) {
                    this.ident = "";
                } else {
                    this.ident = props.facility.icaoStruct.ident;
                }
            }
            if (isActiveWaypointPageProps(props)) {
                this.activeIdx = props.idx;
            } else {
                this.activeIdx = -1;
            }
        } else {
            this.facility = this.getMemory().facility;
            const facility = unpackFacility(this.facility);
            if (facility) {
                this.ident = facility.icaoStruct.ident;
                this.getScanlist().sync(facility.icaoStruct);
            } else {
                this.ident = this.getMemory().ident;
            }

            this.activeIdx = -1;
        }
        this.scanHandler = new ScanHandler(this.getScanlist(), this.props.facilityLoader);
    }

    public abstract getScanlist(): Scanlist;

    tick(blink: boolean) {
        super.tick(blink);
        if (isNearestWpt(this.facility)) {
            const nearestSelector = this.children.get("nearestSelector");
            if (nearestSelector && (nearestSelector as NearestSelector).isFocused) {
                //3-24 the waypoint will be continuously updated
                const nearestList: NearestWpt<T>[] = this.getNearestList()!.getNearestList() as any;
                const idx = Math.min(this.facility.index, nearestList.length - 1);
                if (idx > -1) {
                    const newFacility = nearestList[idx];
                    if (newFacility != this.facility) {
                        this.changeFacility(newFacility);
                    }
                }
            }
        }
    }

    scanLeft(): boolean {
        if (this.scanHandler.isSearchRunning) {
            return true;
        }
        if (isNearestWpt(this.facility) && this.facility.index > -1) {
            if (this.facility.index === 0) {
                return true; //left end, nothing to do
            }
            const nearestListGenerator = this.getNearestList()!;
            const nearestlist = nearestListGenerator.getNearestList();
            if (nearestlist.length > 0) {
                const newIndex = Math.min(nearestlist.length - 1, this.facility.index - 1);
                this.changeFacility(nearestlist[newIndex] as any);
            }
        } else {
            const fac = unpackFacility(this.facility);
            this.scanHandler.scanLeft(fac ? fac.icaoStruct : buildIcaoStructIdentOnly(this.ident.padEnd(5, " "))).then(nextFacility => {
                if (nextFacility === null) { //End of waypointlist, move to the nearestlist if avaiable
                    const nearestListGenerator = this.getNearestList();
                    if (nearestListGenerator !== null) {
                        const nearestlist = nearestListGenerator.getNearestList();
                        if (nearestlist.length > 0) {
                            this.changeFacility(nearestlist[nearestlist.length - 1] as any);
                        }
                    }
                } else {
                    this.changeFacility(nextFacility as any);
                }
            });
        }
        return true;
    }

    scanRight(): boolean {
        if (this.scanHandler.isSearchRunning) {
            return true;
        }
        if (isNearestWpt(this.facility) && this.facility.index > -1) {
            const nearestListGenerator = this.getNearestList()!;
            const nearestlist = nearestListGenerator.getNearestList();
            const newIndex = this.facility.index + 1;
            if (newIndex >= nearestlist.length) { //End of nearest list, move to the beginning of the scanlist
                const startIcao = this.getScanlist().start();
                if (startIcao === null) {
                    this.changeFacility("0    "); //No database??
                } else {
                    this.props.facilityLoader.getFacility(ICAO.getFacilityTypeFromValue(startIcao), startIcao)
                        .then((nextFacility) => this.changeFacility(nextFacility as any));
                }
            } else {
                this.changeFacility(nearestlist[newIndex] as any);
            }
        } else {
            const fac = unpackFacility(this.facility);
            this.scanHandler.scanRight(fac ? fac.icaoStruct : buildIcaoStructIdentOnly(this.ident.padEnd(5, " "))).then(nextFacility => {
                if (nextFacility !== null) {
                    this.changeFacility(nextFacility as any);
                }
            });
        }
        return true;

    }

    protected abstract getMemory(): WaypointPageState<T>;

    protected abstract getNearestList(): AirportNearestList | VorNearestList | NdbNearestList | null;

    protected getActiveIdxText(): string {
        if (this.activeIdx === -1) { //Not the act page
            return "";
        } else if (this.activeIdx === 0) { //Direct to
            return "   ";
        }
        return (this.activeIdx).toString().padStart(2, " ") + " ";
    }

    protected changeFacility(fac: T | NearestWpt<T> | string) {
        if (fac === undefined) {
            console.error("Somehow the facility got undefined, ignoring...");
            return;
        }

        if (typeof fac === "string") {
            this.facility = null;
            this.ident = fac;
        } else {
            this.facility = fac;
            const facility = unpackFacility(this.facility);
            this.ident = facility.icaoStruct.ident;
            this.getScanlist().sync(facility.icaoStruct);
        }

        this.getMemory().facility = this.facility;
        this.getMemory().ident = this.ident;
        this.requiresRedraw = true;
    }

}

export interface WaypointPageProps<T extends Facility> extends PageProps {
    facility: T | NearestWpt<T>;
}

export function isWaypointPageProps<T extends Facility>(props: PageProps): props is WaypointPageProps<T> {
    return "facility" in props;
}

export interface ActiveWaypointPageProps<T extends Facility> extends PageProps {
    facility: T | null;
    idx: number,
}

export function isActiveWaypointPageProps<T extends Facility>(props: PageProps): props is ActiveWaypointPageProps<T> {
    return "idx" in props;
}

export function isUserWaypoint(fac: Facility): boolean {
    return fac.icaoStruct.region === USER_WAYPOINT || fac.icaoStruct.region === TEMPORARY_WAYPOINT;
}

/**
 * If facility is a NearestFacility, then this return the internal facility
 * @protected
 */
export function unpackFacility<T extends Facility>(facility: T | NearestWpt<T>): T;
export function unpackFacility<T extends Facility>(facility: T | NearestWpt<T> | null): T | null;
export function unpackFacility<T extends Facility>(facility: T | NearestWpt<T> | null): T | null {
    if (isNearestWpt(facility)) {
        return facility.facility;
    } else {
        return facility;
    }
}

export function isNearestWpt<T extends Facility>(wpt: NearestWpt<T> | T | null): wpt is NearestWpt<T> {
    return wpt !== null && "facility" in wpt;
}


export function isWapointPage(page: any): page is WaypointPage<Facility> {
    return "facility" in page;
}