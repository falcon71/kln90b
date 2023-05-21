import {Facility, FacilityType, FSComponent, ICAO, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, PageSide, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {List} from "../../controls/List";
import {SimpleListItem} from "../../controls/ListItem";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {getCountry} from "../../data/CountryMap";
import {MainPage} from "../MainPage";

interface DuplicateWaypointPageProps extends PageProps {
    ident: string,
    waypoints: Facility[],

    side: PageSide,
    parent: SixLineHalfPage,
}

interface FullDuplicateWaypointPageProps extends DuplicateWaypointPageProps {
    resolve: (value: Facility) => void,
}

type DuplicateWaypointPageTypes = {
    ident: TextDisplay,
    count: TextDisplay,
    wptList: List,
}

export class DuplicateWaypointPage extends SixLineHalfPage {

    public readonly cursorController;
    readonly children;

    readonly name: string = "     ";


    private constructor(props: FullDuplicateWaypointPageProps) {
        super(props);

        const list = props.waypoints.map((wpt, idx) => new SimpleListItem<Facility>({
            bus: this.props.bus,
            value: wpt,
            fulltext: this.formatWptText(wpt, idx + 1),
            onEnter: this.selectWaypoint.bind(this),
        }));

        this.children = new UIElementChildren<DuplicateWaypointPageTypes>({
            ident: new TextDisplay(props.ident.padEnd(5, " ")),
            count: new TextDisplay(props.waypoints.length.toString().padStart(4, " ")),
            wptList: new List(UIElementChildren.forList(list)),
        });
        this.cursorController = new CursorController(this.children);
        this.cursorController.setCursorActive(true);
    }

    public static async selectDuplicateWaypoint(props: DuplicateWaypointPageProps): Promise<Facility> {
        const mainPage = props.pageManager.getCurrentPage() as MainPage;
        return new Promise<Facility>((resolve) => {
            const fullprops = {
                ...props,
                resolve: resolve,
            };
            mainPage.pushPage(new DuplicateWaypointPage(fullprops), props.parent, props.side);
        });
    }

    public render(): VNode {
        return (<pre>
             &nbsp{this.children.get("ident").render()} {this.children.get("count").render()}<br/>
            {this.children.get("wptList").render()}
        </pre>);
    }

    private formatWptText(wpt: Facility, idx: number): string {
        return idx.toString().padStart(2, " ") + " " + this.formatType(ICAO.getFacilityType(wpt.icao)) + " " + getCountry(wpt) + "?";
    }

    private formatType(type: FacilityType): string {
        switch (type) {
            case FacilityType.Airport:
                return "APT";
            case FacilityType.USR:
                return "SUP";
            case FacilityType.VOR:
                return "VOR";
            case FacilityType.NDB:
                return "NDB";
            case FacilityType.Intersection:
                return "INT";
            default:
                throw new Error(`Unsupported type: ${type}`);
        }
    }

    private selectWaypoint(wpt: Facility) {
        const props = this.props as FullDuplicateWaypointPageProps;

        const mainPage = props.pageManager.getCurrentPage() as MainPage;
        mainPage.popPage(props.side);
        props.resolve(wpt);
    }


}