import {AirportFacility, FSComponent, VNode} from '@microsoft/msfs-sdk';
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {AirportSelector} from "../../controls/selects/AirportSelector";
import {isUserWaypoint, unpackFacility, WaypointPage} from "./WaypointPage";
import {WaypointPageState} from "../../data/VolatileMemory";
import {CreateWaypointMessage} from "../../controls/selects/CreateWaypointMessage";
import {Apt1Page} from "./Apt1Page";
import {Apt3ListPage} from "./Apt3ListPage";
import {Apt3UserPage} from "./Apt3UserPage";
import {Scanlist} from "../../data/navdata/Scanlist";
import {NearestSelector} from "../../controls/selects/NearestSelector";
import {AirportNearestList} from "../../data/navdata/NearestList";
import {ActiveArrow} from "../../controls/displays/ActiveArrow";
import {TextDisplay} from "../../controls/displays/TextDisplay";


type Apt3ListPageTypes = {
    activeArrow: ActiveArrow,
    activeIdx: TextDisplay,
    apt: AirportSelector
    waypointType: TextDisplay,
    nearestSelector: NearestSelector,

    createWpt: CreateWaypointMessage,

    userPage: Apt3UserPage,

    listPage: Apt3ListPage,
}

/**
 * The list page has two format. One for UserAirports and one for airports from the database.
 * This class delegates to those two formats
 */
export class Apt3ListPageContainer extends WaypointPage<AirportFacility> {

    public readonly cursorController;
    readonly children: UIElementChildren<Apt3ListPageTypes>;

    readonly name: string = "APT 3";

    private readonly listPage: Apt3ListPage;
    private readonly userPage: Apt3UserPage;

    /**
     *
     * @param props
     * @param changeFacilityCallback Don't call our internal function. The parent must refresh the page count, he will call our funktion
     */
    constructor(props: PageProps, changeFacilityCallback: (icao: AirportFacility | string) => void) {
        super(props);

        this.userPage = new Apt3UserPage(props);
        this.listPage = new Apt3ListPage(props);

        const facility = unpackFacility(this.facility);

        this.children = new UIElementChildren<Apt3ListPageTypes>({
            activeArrow: new ActiveArrow(facility?.icao ?? null, this.props.memory.navPage),
            activeIdx: new TextDisplay(this.getActiveIdxText()),
            apt: new AirportSelector(this.props.bus, this.ident, this.props.facilityLoader, changeFacilityCallback),
            waypointType: new TextDisplay(this.activeIdx === -1 ? "" : "A"),
            nearestSelector: new NearestSelector(this.facility),
            createWpt: new CreateWaypointMessage(() => Apt1Page.createAtUserPosition(props), () => Apt1Page.createAtPresentPosition(props)),
            userPage: this.userPage,
            listPage: this.listPage,
        });

        if (this.facility === null) {
            this.children.get("createWpt").setVisible(true);
            this.numPages = 1;
        } else {
            this.numPages = this.getCurrentPage()!.numPages;
            this.children.get("createWpt").setVisible(false);
        }

        if (this.activeIdx !== -1) {
            this.children.get("apt").setReadonly(true);
        }
        this.cursorController = new CursorController(this.children);

    }


    public render(): VNode {
        return (<pre>
           {this.children.get("activeArrow").render()}{this.children.get("activeIdx").render()}{this.children.get("apt").render()}&nbsp&nbsp{this.children.get("waypointType").render()}{this.children.get("nearestSelector").render()}<br/>
            {this.listPage.render()}
            {this.userPage.render()}
            {this.children.get("createWpt").render()}
        </pre>);
    }

    public changeFacility(fac: string | AirportFacility) {
        super.changeFacility(fac);
        this.children.get("apt").setValue(this.ident);
        this.children.get("activeArrow").icao = unpackFacility(this.facility)?.icao ?? null;
        this.currentPage = 0;
        this.userPage.changeFacility(fac);
        this.listPage.changeFacility(fac);

        if (this.facility === null) {
            this.children.get("createWpt").setVisible(true);
        } else {
            this.numPages = this.getCurrentPage()!.numPages;
            this.children.get("createWpt").setVisible(false);
        }
    }

    public getScanlist(): Scanlist {
        return this.props.scanLists.aptScanlist;
    }

    setCurrentPage(page: number) {
        this.currentPage = page;
        this.getCurrentPage()?.setCurrentPage(page);

        super.setCurrentPage(page);
    }

    protected redraw() {
        this.children.get("nearestSelector").setFacility(this.facility);
    }

    protected getMemory(): WaypointPageState<AirportFacility> {
        return this.props.memory.aptPage;
    }

    protected getNearestList(): AirportNearestList {
        return this.props.nearestLists.aptNearestList;
    }

    private getCurrentPage(): Apt3ListPage | Apt3UserPage | null {
        const facility = unpackFacility(this.facility);
        if (facility === null) {
            return null;
        }
        return isUserWaypoint(facility) ? this.userPage : this.listPage;
    }
}