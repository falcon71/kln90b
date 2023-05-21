import {
    BitFlags,
    BoundaryType,
    Facility,
    FacilitySearchType,
    FacilityType,
    FSComponent,
    ICAO,
    LodBoundary,
    NodeReference,
    UnitType,
    UserFacility,
    UserFacilityType,
    VNode,
} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {EnterResult, NO_CURSOR_CONTROLLER} from "../CursorController";
import {MainPage} from "../MainPage";
import {FplPage} from "../left/FplPage";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {AirspaceIntersection, airspaceIntersectionsAlongRoute} from "../../services/AirspacesAlongRoute";
import {format} from "numerable";
import {CtrState} from "../../data/VolatileMemory";
import {KLNLegType} from "../../data/flightplan/Flightplan";
import {StatusLineMessageEvents} from "../../controls/StatusLine";
import {insertLegIntoFpl} from "../../services/FlightplanUtils";

type Ctr1PageTypes = {
    newWpts: TextDisplay;
}

export interface CenterWaypoint {
    wpt: UserFacility,
    idx: number,
    airspaceFrom: LodBoundary,
    airspaceTo: LodBoundary,
    isNew: boolean,
}

/**
 * 5-21
 */
export class Ctr1Page extends SixLineHalfPage {

    public cursorController = NO_CURSOR_CONTROLLER;
    readonly children: UIElementChildren<Ctr1PageTypes>;


    readonly name: string = "CTR 1";

    private readonly refFpl: NodeReference<HTMLPreElement> = FSComponent.createRef<HTMLPreElement>();
    private readonly refCalulated: NodeReference<HTMLPreElement> = FSComponent.createRef<HTMLPreElement>();
    private readonly refDone: NodeReference<HTMLPreElement> = FSComponent.createRef<HTMLPreElement>();
    private readonly refFull: NodeReference<HTMLPreElement> = FSComponent.createRef<HTMLPreElement>();
    private readonly refOther: NodeReference<HTMLPreElement> = FSComponent.createRef<HTMLPreElement>();

    constructor(props: PageProps) {
        super(props);

        this.children = new UIElementChildren<Ctr1PageTypes>({
            newWpts: new TextDisplay("  "),
        });

    }


    public isEnterAccepted(): boolean {
        switch (this.props.memory.ctrPage.state) {
            case CtrState.FPL:
            case CtrState.CALCULATED:
                return true;
            default:
                return false;

        }
    }

    public enter(): Promise<EnterResult> {
        switch (this.props.memory.ctrPage.state) {
            case CtrState.NO_FPL:
            case CtrState.DONE:
            case CtrState.FULL:
                return Promise.resolve(EnterResult.Not_Handled);
            case CtrState.FPL:
                return this.calculateCenterWaypoints().then(() => EnterResult.Handled_Keep_Focus);
            case CtrState.CALCULATED:
                this.insertIntoFpl();
                return Promise.resolve(EnterResult.Handled_Keep_Focus);
        }
    }

    public render(): VNode {
        return (
            <div>
                <pre ref={this.refFpl} class="d-none">
                    <br/>
                    <br/>
                    PRESS ENT<br/>
                    TO COMPUTE<br/>
                    CTR WPTS
                </pre>
                <pre ref={this.refCalulated} className="d-none">
                    {this.children.get("newWpts").render()} NEW WPTS<br/>
                    <br/>
                    PRESS ENT<br/>
                    TO INSERT<br/>
                    INTO FPL
                </pre>
                <pre ref={this.refDone} className="d-none">
                    <br/>
                    <br/>
                    CTR WPT<br/>
                    INSERTION<br/>
                    COMPLETE
                </pre>
                <pre ref={this.refFull} className="d-none">
                    <br/>
                    <br/>
                    NOT ENOUGH<br/>
                    ROOM<br/>
                    IN FPL
                </pre>
                <pre ref={this.refOther}>
                    <br/>
                    DISPLAY<br/>
                    DESIRED<br/>
                    FPL ON<br/>
                    LEFT PAGE
                </pre>
            </div>
        );
    }

    tick(blink: boolean) {
        const mainPage = this.props.pageManager.getCurrentPage() as MainPage;
        const page = mainPage.getLeftPage();


        const pageState = this.props.memory.ctrPage;
        if (page instanceof FplPage) {
            if (page.fplIdx !== pageState.lastFpl?.idx) {
                pageState.state = CtrState.FPL;
                pageState.waypoints = [];
                pageState.lastFpl = this.props.memory.fplPage.flightplans[page.fplIdx];
            }

            switch (pageState.state) {
                case CtrState.FPL:
                    this.refFpl.instance.classList.remove("d-none");
                    this.refCalulated.instance.classList.add("d-none");
                    this.refDone.instance.classList.add("d-none");
                    this.refFull.instance.classList.add("d-none");
                    break;
                case CtrState.CALCULATED:
                    this.refFpl.instance.classList.add("d-none");
                    this.refCalulated.instance.classList.remove("d-none");
                    this.refDone.instance.classList.add("d-none");
                    this.refFull.instance.classList.add("d-none");
                    this.children.get("newWpts").text = pageState.waypoints.filter(wpt => wpt.isNew).length.toString().padStart(2, " ");
                    break;
                case CtrState.DONE:
                    this.refFpl.instance.classList.add("d-none");
                    this.refCalulated.instance.classList.add("d-none");
                    this.refDone.instance.classList.remove("d-none");
                    this.refFull.instance.classList.add("d-none");
                    break;
                case CtrState.FULL:
                    this.refFpl.instance.classList.add("d-none");
                    this.refCalulated.instance.classList.add("d-none");
                    this.refDone.instance.classList.add("d-none");
                    this.refFull.instance.classList.remove("d-none");
                    break;
                default:
                    throw new Error(`Unexpected state: ${pageState.state}`);


            }
            this.refOther.instance.classList.add("d-none");
        } else {
            pageState.state = CtrState.NO_FPL;
            pageState.lastFpl = null;
            pageState.waypoints = [];

            this.refFpl.instance.classList.add("d-none");
            this.refCalulated.instance.classList.add("d-none");
            this.refDone.instance.classList.add("d-none");
            this.refFull.instance.classList.add("d-none");
            this.refOther.instance.classList.remove("d-none");
        }
    }

    private async calculateCenterWaypoints() {
        const fplLegs = this.props.memory.ctrPage.lastFpl!.getLegs();
        if (fplLegs.length < 2) {
            return;
        }
        const route = fplLegs.map(l => l.wpt);

        const intersections = await airspaceIntersectionsAlongRoute(route, this.props.nearestUtils, BitFlags.createFlag(BoundaryType.Center));

        console.log("intersections", intersections);

        if (fplLegs.length + intersections.length > 30) {
            this.props.memory.ctrPage.state = CtrState.FULL;
        }

        for (const intersection of intersections) {
            let wpt = this.getWaypointIfExistsInFpl(intersection);
            if (wpt === null) {
                wpt = await this.createWpt(intersection);
            }
            if (wpt !== null) {
                this.props.memory.ctrPage.waypoints.push(wpt);
            }
        }


        this.props.memory.ctrPage.state = CtrState.CALCULATED;
    }

    private insertIntoFpl() {
        const mainPage = this.props.pageManager.getCurrentPage() as MainPage;
        const page = mainPage.getLeftPage() as FplPage;

        const fpl = this.props.memory.ctrPage.lastFpl!;
        let inserted = 0;
        for (const wpt of this.props.memory.ctrPage.waypoints.filter(wpt => wpt.isNew)) {
            insertLegIntoFpl(fpl, this.props.memory.navPage, wpt.idx + inserted, {wpt: wpt.wpt, type: KLNLegType.USER});
            inserted++;
        }

        page.refreshFpl();

        this.props.memory.ctrPage.state = CtrState.DONE;
    }

    /**
     * 5-27 If the waypoint already exists, then it won't be recreated.
     * Let's assume, that the waypoint exists, when it is a user WPT, and it has the same coordinates.
     * @param intersection
     * @private
     */
    private getWaypointIfExistsInFpl(intersection: AirspaceIntersection): CenterWaypoint | null {
        const legs = this.props.memory.ctrPage.lastFpl!.getLegs();

        for (const leg of legs) {
            if (ICAO.getFacilityType(leg.wpt.icao) === FacilityType.USR && leg.wpt.lat === intersection.intersection.lat && leg.wpt.lon === intersection.intersection.lon) {
                return {
                    isNew: false,
                    idx: -1, //Only relevant for inserting new waypoints
                    airspaceFrom: intersection.airspaceFrom,
                    airspaceTo: intersection.airspaceTo,
                    wpt: leg.wpt as UserFacility,
                }
            }
        }

        return null;
    }

    private async createWpt(intersection: AirspaceIntersection): Promise<CenterWaypoint | null> {
        const closestVor = await this.props.nearestUtils.getNearestVor(intersection.intersection.lat, intersection.intersection.lon);
        if (closestVor === null) {
            return null;
        }

        const ident = await this.getUniqueIdent(closestVor);
        if (ident === null) {
            return null;
        }

        const facility: UserFacility = {
            icao: `UXY    ${ident.padEnd(5, " ")}`, //XY marks this as temporyry
            name: "",
            lat: intersection.intersection.lat,
            lon: intersection.intersection.lon,
            region: "XX",
            city: "",
            magvar: 0,
            isTemporary: false, //irrelevant, because this flag is not persisted
            userFacilityType: UserFacilityType.LAT_LONG,
            reference1Icao: closestVor.icao,
            reference1Radial: intersection.intersection.bearingFrom(closestVor),
            reference1Distance: UnitType.GA_RADIAN.convertTo(intersection.intersection.distance(closestVor), UnitType.NMILE),
        };

        try {
            this.props.facilityLoader.facilityRepo.add(facility);
        } catch (e) {
            this.props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "USR DB FULL");
            console.error(e);
            return null;
        }

        return {
            isNew: true,
            idx: intersection.legIdx,
            airspaceFrom: intersection.airspaceFrom,
            airspaceTo: intersection.airspaceTo,
            wpt: facility,
        };
    }

    private async getUniqueIdent(wpt: Facility): Promise<string | null> {
        const start = ICAO.getIdent(wpt.icao);
        const existing = await this.props.facilityLoader.searchByIdent(FacilitySearchType.All, start, 100);
        const existingIdents = existing.map(ICAO.getIdent);
        for (let i = 0; i < 100; i++) {
            const checkIdent = start + format(i, "00");
            if (!existingIdents.includes(checkIdent)) {
                return checkIdent;
            }
        }
        return null;
    }


}