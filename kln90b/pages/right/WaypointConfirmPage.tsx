import {Facility, FacilityType, FSComponent, ICAO, NodeReference, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {EnterResult, NO_CURSOR_CONTROLLER} from "../CursorController";
import {Apt1Page} from "./Apt1Page";
import {NdbPage} from "./NdbPage";
import {VorPage} from "./VorPage";
import {IntPage} from "./IntPage";
import {SupPage} from "./SupPage";
import {MainPage} from "../MainPage";
import {unpackFacility, WaypointPage, WaypointPageProps} from "./WaypointPage";
import {WaypointPageState} from "../../data/VolatileMemory";
import {Scanlist} from "../../data/navdata/Scanlist";
import {UIElementChildren} from "../Page";
import {PageTreeController, RIGHT_PAGE_TREE} from "../PageTreeController";


interface FullWaypointPageProps extends WaypointPageProps<any> {
    resolve: (value: Facility) => void,
}

type WaypointConfirmPageTypes = {
    page: WaypointPage<Facility>,
}

export class WaypointConfirmPage extends WaypointPage<Facility> {

    public readonly cursorController = NO_CURSOR_CONTROLLER;
    public readonly children: UIElementChildren<WaypointConfirmPageTypes>;

    public name: string;


    public pageTreeController: PageTreeController;

    private readonly ref: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();

    private constructor(props: WaypointPageProps<Facility>) {
        super(props);


        console.log(this.facility);

        const facility = unpackFacility(this.facility);
        if (facility === null) {
            throw new Error("Facility must be defined in the props");
        }

        let page: SixLineHalfPage;

        switch (ICAO.getFacilityTypeFromValue(facility.icaoStruct)) {
            case FacilityType.Airport:
                page = new Apt1Page(props);
                break;
            case FacilityType.NDB:
                page = new NdbPage(props);
                break;
            case FacilityType.VOR:
                page = new VorPage(props);
                break;
            case FacilityType.Intersection:
            case FacilityType.RWY:
                page = new IntPage(props);
                break;
            case FacilityType.USR:
                page = new SupPage(props);
                break;
            default:
                throw new Error(`Unexpected facilityType: ${facility.icaoStruct}`);
        }

        this.pageTreeController = new PageTreeController(RIGHT_PAGE_TREE, page, this.props, this.pageChanged.bind(this));
        this.name = this.pageTreeController.currentPage.name;

        this.children = new UIElementChildren({
            page: this.pageTreeController.currentPage,
        });
    }

    public static async showWaypointconfirmation(props: WaypointPageProps<any>, parent: SixLineHalfPage): Promise<Facility> {
        const mainPage = props.pageManager.getCurrentPage() as MainPage;
        if ("idx" in props) {
            delete props.idx; //Just to make sure, this does not get interpreted as ActiveWaypointPageProps
        }

        return new Promise<Facility>((resolve) => {
            const fullprops = {
                ...props,
                resolve: resolve,
            };
            mainPage.pushRightPage(new WaypointConfirmPage(fullprops), parent);
        });
    }

    public render(): VNode {
        return (<div ref={this.ref}>{this.pageTreeController.currentPage.render()}</div>);
    }

    isEnterAccepted(): boolean {
        return true;
    }

    enter(): Promise<EnterResult> {
        const props = this.props as FullWaypointPageProps;

        const mainPage = props.pageManager.getCurrentPage() as MainPage;
        mainPage.popRightPage();
        props.resolve(unpackFacility(this.facility)!);
        return Promise.resolve(EnterResult.Handled_Keep_Focus);
    }

    public getScanlist(): Scanlist {
        return this.props.scanLists.aptScanlist; //Doesn't really matter, we disable scanning anyway by overwriting the scan methods
    }

    scanLeft(): boolean {
        return false; //We don't scan here
    }

    scanRight(): boolean {
        return false; //We don't scan here
    }

    protected getMemory(): WaypointPageState<Facility> {
        throw new Error("Facility must be defined in the props");
    }

    protected getNearestList(): null {
        throw new Error("No nearestLists either");
    }

    protected redraw(): void {
        this.ref.instance.innerHTML = "";
        FSComponent.render(this.pageTreeController.currentPage.render(), this.ref.instance);
    }

    private pageChanged(page: SixLineHalfPage) {
        this.name = page.name;
        this.numPages = page.numPages;
        this.children.set("page", this.pageTreeController.currentPage as WaypointPage<Facility>);
        this.requiresRedraw = true;
    }

}