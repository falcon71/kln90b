import {AirportFacility, FSComponent, NodeReference, VNode} from '@microsoft/msfs-sdk';
import {PageProps} from "../Page";
import {CursorController, NO_CURSOR_CONTROLLER} from "../CursorController";
import {Apt3MapPage} from "./Apt3MapPage";
import {WaypointPage} from "./WaypointPage";
import {WaypointPageState} from "../../data/VolatileMemory";
import {Apt3ListPageContainer} from "./Apt3ListPageContainer";
import {StatusLineMessageEvents} from "../../controls/StatusLine";
import {Scanlist} from "../../data/navdata/Scanlist";
import {AirportNearestList} from "../../data/navdata/NearestList";

export class Apt3Page extends WaypointPage<AirportFacility> {

    public cursorController = NO_CURSOR_CONTROLLER;
    public children;

    readonly name: string = "APT 3";

    private readonly mapPage: Apt3MapPage;
    private readonly listPage: Apt3ListPageContainer;
    private readonly ref: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();

    constructor(props: PageProps) {
        super(props);

        if (this.props.scanLists.aptScanlist.isEmpty()) {
            props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "NO APT WPTS");
        }

        this.mapPage = new Apt3MapPage(props);
        this.listPage = new Apt3ListPageContainer(props, this.changeFacility.bind(this));
        this.numPages = this.mapPage.numPages + this.listPage.numPages;

        this.children = this.getCurrentPage().children;
    }


    public render(): VNode {
        return (
            <div ref={this.ref}>
                {this.getCurrentPage().render()}
            </div>
        );
    }

    setCurrentPage(page: number) {

        const prevPage = this.getCurrentPage();
        super.setCurrentPage(page);
        const listPage = page - this.mapPage!.numPages;

        if (listPage >= 0) {
            this.listPage!.setCurrentPage(listPage);
        }
        const newPage = this.getCurrentPage();
        if (prevPage !== newPage) {
            this.children = newPage.children;
            this.requiresRedraw = true
        }
    }

    tick(blink: boolean) {
        super.tick(blink);
        this.getCurrentPage().tick(blink);
    }

    public getScanlist(): Scanlist {
        return this.props.scanLists.aptScanlist;
    }

    public getCursorController(): CursorController {
        return this.getCurrentPage().cursorController;
    }

    protected changeFacility(fac: string | AirportFacility) {
        super.changeFacility(fac);
        this.mapPage.changeFacility(fac);
        this.listPage.changeFacility(fac);
        this.numPages = this.mapPage.numPages + this.listPage.numPages;

        const targetPage = Math.min(this.currentPage, this.mapPage.numPages);
        if (targetPage !== this.currentPage) {
            this.setCurrentPage(targetPage);
        }
    }

    protected redraw(): void {
        this.ref.instance.innerHTML = "";
        FSComponent.render(this.getCurrentPage().render(), this.ref.instance);
    }

    protected getMemory(): WaypointPageState<AirportFacility> {
        return this.props.memory.aptPage;
    }

    protected getNearestList(): AirportNearestList {
        return this.props.nearestLists.aptNearestList;
    }

    private getCurrentPage(): Apt3MapPage | Apt3ListPageContainer {
        return this.currentPage - this.mapPage.numPages < 0 ? this.mapPage : this.listPage;
    }
}