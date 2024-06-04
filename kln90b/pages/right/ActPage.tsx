import {Facility, FacilityType, FSComponent, ICAO, NodeReference, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {CursorController, EnterResult, NO_CURSOR_CONTROLLER} from "../CursorController";
import {Apt1Page} from "./Apt1Page";
import {NdbPage} from "./NdbPage";
import {VorPage} from "./VorPage";
import {IntPage} from "./IntPage";
import {SupPage} from "./SupPage";
import {ActiveWaypointPageProps, unpackFacility, WaypointPage} from "./WaypointPage";
import {WaypointPageState} from "../../data/VolatileMemory";
import {Scanlist} from "../../data/navdata/Scanlist";
import {PageProps, UIElementChildren} from "../Page";
import {PageTreeController, RIGHT_PAGE_TREE} from "../PageTreeController";


type ActPagePageTypes = {
    page: WaypointPage<Facility>,
}

/**
 * Will show the last active waypoint when no waypoint is currently active: https://www.youtube.com/shorts/9We5fcd2-VE
 * May also show NO ACTIVE: https://youtu.be/Q6m7_CVGPCg?t=19
 * 4-10
 */
export class ActPagePage extends WaypointPage<Facility> {

    public readonly cursorController: CursorController = NO_CURSOR_CONTROLLER;
    public readonly children: UIElementChildren<ActPagePageTypes>;

    public name: string;


    public pageTreeController: PageTreeController;

    private readonly ref: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();

    private actIdx = -1;

    constructor(public props: PageProps) {
        super(ActPagePage.buildProps(props));

        console.log(this.facility);

        const facility: Facility | null = unpackFacility(this.facility)!;

        this.actIdx = props.memory.navPage.activeWaypoint.getActiveFplIdx();
        const page = this.buildPage(facility, this.actIdx);

        this.pageTreeController = new PageTreeController(RIGHT_PAGE_TREE, page, page.props, this.pageChanged.bind(this));
        this.name = this.buildName(this.pageTreeController.currentPage.name);

        this.children = new UIElementChildren({
            page: this.pageTreeController.currentPage,
        });

    }

    private static buildProps(props: PageProps): ActiveWaypointPageProps<Facility> {
        const idx = props.memory.navPage.activeWaypoint.getActiveFplIdx();

        const facility = props.memory.navPage.activeWaypoint.lastactiveWaypoint;
        return {
            ...props,
            facility: facility,
            idx: facility === null ? -1 : idx + 1,
        };
    }

    public render(): VNode {
        if (this.facility === null) {
            return (<div ref={this.ref}>
                <br/>
                <br/>
                NO ACTIVE<br/>
                <br/>
                WAYPOINT
            </div>);
        } else {
            return (<div ref={this.ref}>{this.pageTreeController.currentPage.render()}</div>);
        }
    }

    public getScanlist(): Scanlist {
        return this.props.scanLists.aptScanlist; //Doesn't really matter, we disable scanning anyway by overwriting the scan methods
    }

    scanLeft(): boolean {
        if (this.actIdx === -1) {
            return false;
        }
        this.actIdx = Utils.Clamp(this.actIdx - 1, 0, this.props.memory.fplPage.flightplans[0].getLegs().length - 1);
        this.rebuildPage();
        return true;
    }

    scanRight(): boolean {
        if (this.actIdx === -1) {
            return false;
        }
        this.actIdx = Utils.Clamp(this.actIdx + 1, 0, this.props.memory.fplPage.flightplans[0].getLegs().length - 1);
        this.rebuildPage();
        return true;
    }

    public isEnterAccepted(): boolean {
        return this.pageTreeController.currentPage.isEnterAccepted();
    }

    public enter(): Promise<EnterResult> {
        return this.pageTreeController.currentPage.enter();
    }

    public clear(): boolean {
        return this.pageTreeController.currentPage.clear();
    }

    public getCursorController(): CursorController {
        return this.pageTreeController.currentPage.getCursorController();
    }

    protected getMemory(): WaypointPageState<Facility> {
        throw new Error("Don't save anything here");
    }

    protected getNearestList(): null {
        throw new Error("No nearestLists either");
    }

    protected redraw(): void {
        if (this.facility !== null) {
            this.ref.instance.innerHTML = "";
            FSComponent.render(this.pageTreeController.currentPage.render(), this.ref.instance);
        }
    }

    private buildPage(facility: Facility | null, idx: number): WaypointPage<Facility> {
        const props: ActiveWaypointPageProps<Facility> = {
            ...this.props,
            facility: facility,
            idx: idx === -1 ? 0 : idx,
        };

        if (facility === null) {
            return new SupPage(props);
        }

        switch (ICAO.getFacilityType(facility.icao)) {
            case FacilityType.Airport:
                return new Apt1Page(props);
            case FacilityType.NDB:
                return new NdbPage(props);
            case FacilityType.VOR:
                return new VorPage(props);
            case FacilityType.Intersection:
            case FacilityType.RWY:
                return new IntPage(props);
            case FacilityType.USR:
                return new SupPage(props);
            default:
                throw Error(`Unexpected facilityType: ${facility.icao}`);
        }
    }

    private buildName(originalName: string): string {
        return `ACT ${originalName.substring(4)}`;
    }

    private pageChanged(page: SixLineHalfPage) {
        this.name = this.buildName(page.name);
        this.numPages = page.numPages;
        this.children.set("page", this.pageTreeController.currentPage as WaypointPage<Facility>);
        this.requiresRedraw = true;
    }

    private rebuildPage() {
        const legs = this.props.memory.fplPage.flightplans[0].getLegs();
        this.facility = legs[this.actIdx].wpt;
        this.ident = ICAO.getIdent(this.facility.icao);

        const page = this.buildPage(this.facility, this.actIdx);
        this.pageTreeController.props = page.props;
        this.pageTreeController.setPage(page);
    }
}