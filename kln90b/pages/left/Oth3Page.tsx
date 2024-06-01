import {Facility, FacilityType, FSComponent, ICAO, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {List} from "../../controls/List";
import {KLNFacilityRepository} from "../../data/navdata/KLNFacilityRepository";
import {KLNErrorMessage} from "../../controls/StatusLine";
import {WaypointDeleteListItem} from "../../controls/WaypointDeleteListItem";
import {IcaoFixedLength} from "../../data/navdata/IcaoFixedLength";
import {TemporaryWaypointDeleter} from "../../services/TemporaryWaypointDeleter";


type Oth3PageTypes = {
    wptList: List
}

/**
 * 5-20
 */
export class Oth3Page extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Oth3PageTypes>;

    readonly name: string = "OTH 3";

    constructor(props: PageProps) {
        super(props);

        this.children = new UIElementChildren<Oth3PageTypes>({
            wptList: new List(UIElementChildren.forList(this.buildList())),
        });
        this.cursorController = new CursorController(this.children);


        this.props.bus.getSubscriber<any>().on(KLNFacilityRepository.SYNC_TOPIC).handle(this.refreshList.bind(this));
    }

    public render(): VNode {
        return (<pre>
            &nbspUSER WPTS<br/>
            {this.children.get("wptList").render()}
        </pre>);
    }

    private buildList(): WaypointDeleteListItem[] {
        const list: Facility[] = [];
        this.props.facilityLoader.facilityRepo.forEach(f => list.push(f));
        return list.sort(this.compareUserFacilities.bind(this)).map(f => new WaypointDeleteListItem({
            ...this.props,
            value: f,
            fulltext: this.getListitemText(f),
            deleteText: IcaoFixedLength.getIdentFromFacility(f),
            onDelete: this.deleteFacility.bind(this),
            onBeforeDelete: this.beforeDeleteFacility.bind(this),
        }, this));
    }

    /**
     * 5-20 We sort by category, then by identifier
     * @param a
     * @param b
     * @private
     */
    private compareUserFacilities(a: Facility, b: Facility): number {
        const aCat = this.getSortIndex(ICAO.getFacilityType(a.icao));
        const bCat = this.getSortIndex(ICAO.getFacilityType(b.icao));
        if (aCat === bCat) {
            return ICAO.getIdent(a.icao).localeCompare(ICAO.getIdent(b.icao));
        } else {
            return aCat - bCat;
        }
    }

    private getListitemText(fac: Facility): string {
        let type: string;
        switch (ICAO.getFacilityType(fac.icao)) {
            case FacilityType.Airport:
                type = "A";
                break;
            case FacilityType.VOR:
                type = "V";
                break;
            case FacilityType.NDB:
                type = "N";
                break;
            case FacilityType.Intersection:
                type = "I";
                break;
            case FacilityType.USR:
                type = "S";
                break;
            default:
                throw new Error(`Unsupported type: ${fac.icao}`);
        }

        const fpl = TemporaryWaypointDeleter.findUsageInFlightplans(fac.icao, this.props.memory.fplPage.flightplans);
        const fplString = fpl === null ? "  " : fpl.toString().padStart(2, " ");

        return `${IcaoFixedLength.getIdentFromFacility(fac)} ${type}  ${fplString}`;
    }

    private getSortIndex(type: FacilityType): number {
        switch (type) {
            case FacilityType.Airport:
                return 0;
            case FacilityType.VOR:
                return 1;
            case FacilityType.NDB:
                return 2;
            case FacilityType.Intersection:
                return 3;
            case FacilityType.USR:
                return 4;
            default:
                throw new Error(`Unsupported type: ${type}`);
        }
    }

    private refreshList() {
        this.children.get("wptList").refresh(UIElementChildren.forList(this.buildList()));

        this.cursorController.refreshChildren(this.children);

    }

    private deleteFacility(facility: Facility) {
        this.props.facilityLoader.facilityRepo.remove(facility);
    }

    private beforeDeleteFacility(facility: Facility): KLNErrorMessage | null {
        const activeWpt = this.props.memory.navPage.activeWaypoint.getActiveWpt();
        if (activeWpt?.icao === facility.icao) {
            return "ACTIVE WPT";
        } else if (TemporaryWaypointDeleter.findUsageInFlightplans(facility.icao, this.props.memory.fplPage.flightplans) !== null) {
            return "USED IN FPL";
        }
        return null;
    }


}