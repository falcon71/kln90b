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

    private requiresRebuild = false;

    public pageTreeController: PageTreeController;

    private readonly noActiveRef: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();
    private readonly innerRef: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();


    constructor(public props: PageProps) {
        super(ActPagePage.buildProps(props));

        console.log(this.facility);

        const facility: Facility | null = unpackFacility(this.facility)!;

        const page = this.buildPage(facility, this.activeIdx);

        this.pageTreeController = new PageTreeController(RIGHT_PAGE_TREE, page, page.props, this.pageChanged.bind(this));
        this.name = this.buildName(this.pageTreeController.currentPage.name);

        this.children = new UIElementChildren({
            page: this.pageTreeController.currentPage,
        });

    }

    private static buildProps(props: PageProps): ActiveWaypointPageProps<Facility> {
        const idx = props.memory.navPage.activeWaypoint.getActiveFplIdx();

        const facility = props.memory.navPage.activeWaypoint.getActiveWpt();
        return {
            ...props,
            facility: facility,
            idx: idx,
        };
    }

    public render(): VNode {
        this.requiresRedraw = true;
        return (<div>
            <div ref={this.noActiveRef}>
                <br/>
                <br/>
                NO ACTIVE<br/>
                <br/>
                WAYPOINT
            </div>
            <div ref={this.innerRef} class="d-none">{this.pageTreeController.currentPage.render()}</div>
        </div>);

    }

    public getScanlist(): Scanlist {
        return this.props.scanLists.aptScanlist; //Doesn't really matter, we disable scanning anyway by overwriting the scan methods
    }

    scanLeft(): boolean {
        if (this.activeIdx === -1) {
            return false;
        }

        const newIdx = Utils.Clamp(this.activeIdx - 1, 0, this.props.memory.fplPage.flightplans[0].getLegs().length - 1);
        if (newIdx !== this.activeIdx) {
            this.rebuildPage(newIdx);
        }

        return true;
    }

    scanRight(): boolean {
        if (this.activeIdx === -1) {
            return false;
        }

        const newIdx = Utils.Clamp(this.activeIdx + 1, 0, this.props.memory.fplPage.flightplans[0].getLegs().length - 1);
        if (newIdx !== this.activeIdx) {
            this.rebuildPage(newIdx);
        }

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

    public tick(blink: boolean): void {
        super.tick(blink);

        const expectedWaypoint = this.getExpectedActiveWaypoint();
        if (expectedWaypoint === null) {
            if (this.facility !== null) {
                //We no longer have a new active waypoint
                this.rebuildPage(-1);
            }
        } else {
            if (this.facility === null //We now have a new active waypoint
                || !ICAO.valueEquals(expectedWaypoint.icaoStruct, unpackFacility(this.facility)!.icaoStruct) //Or the current waypoint no longer matches the active waypoint
            ) {
                this.rebuildPage(this.props.memory.navPage.activeWaypoint.getActiveFplIdx());
            }
        }
    }

    protected redraw(): void {
        if (this.facility === null) {
            this.noActiveRef.instance.classList.remove("d-none");
            this.innerRef.instance.classList.add("d-none");
        } else {
            this.noActiveRef.instance.classList.add("d-none");
            this.innerRef.instance.classList.remove("d-none");
            this.innerRef.instance.innerHTML = "";

            if (this.requiresRebuild) {
                const page = this.buildPage(unpackFacility(this.facility), this.activeIdx);
                this.pageTreeController.props = page.props;
                this.pageTreeController.setPage(page);
                this.requiresRebuild = false;
            }

            FSComponent.render(this.pageTreeController.currentPage.render(), this.innerRef.instance);
        }
    }

    /**
     * The active waypoint can change all the time. Here we do a sanity check, if our currently displayed waypoint still makes sense
     * @private
     */
    private getExpectedActiveWaypoint(): Facility | null {
        const actualActiveIdx = this.props.memory.navPage.activeWaypoint.getActiveFplIdx();
        if (actualActiveIdx === -1) {
            return this.props.memory.navPage.activeWaypoint.getActiveWpt(); //Might be a random DTO
        } else {
            const wptAtIdx = this.props.memory.fplPage.flightplans[0].getLegs()[this.activeIdx];
            if (wptAtIdx) {
                return wptAtIdx.wpt;
            } else {
                return this.props.memory.navPage.activeWaypoint.getActiveWpt();
            }
        }
    }

    private buildPage(facility: Facility | null, idx: number): WaypointPage<Facility> {
        const props: ActiveWaypointPageProps<Facility> = {
            ...this.props,
            facility: facility,
            idx: idx === -1 ? 0 : idx + 1,
        };

        if (facility === null) {
            return new SupPage(props);
        }

        switch (ICAO.getFacilityTypeFromValue(facility.icaoStruct)) {
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
                throw new Error(`Unexpected facilityType: ${facility.icaoStruct}`);
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

    private rebuildPage(newActiveIdx: number) {
        this.activeIdx = newActiveIdx;
        if (this.activeIdx === -1) {
            const activeWpt = this.props.memory.navPage.activeWaypoint.getActiveWpt();
            if (activeWpt) {
                //Random DTO
                this.facility = activeWpt;
                this.ident = this.facility.icaoStruct.ident;
            } else {
                this.facility = null;
                this.ident = "";
            }
        } else {
            const legs = this.props.memory.fplPage.flightplans[0].getLegs();
            this.facility = legs[this.activeIdx].wpt;
            this.ident = this.facility.icaoStruct.ident;
        }
        this.requiresRedraw = true;
        this.requiresRebuild = true;
    }
}