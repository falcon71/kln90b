import {
    Facility,
    FSComponent,
    GeoCircle,
    GeoPoint,
    NodeReference,
    UnitType,
    UserFacility,
    UserFacilityType,
    VNode,
} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {MainPage} from "../MainPage";
import {FplPage} from "../left/FplPage";
import {WaypointEditor} from "../../controls/editors/WaypointEditor";
import {Flightplan} from "../../data/flightplan/Flightplan";
import {StatusLineMessageEvents} from "../../controls/StatusLine";
import {getUniqueIdent} from "../../data/navdata/UniqueIdentGenerator";
import {buildIcao, buildIcaoStruct, TEMPORARY_WAYPOINT} from "../../data/navdata/IcaoBuilder";

type RefPageTypes = {
    wpt: WaypointEditor;
}

/**
 * 5-21
 */
export class RefPage extends SixLineHalfPage {

    public cursorController;
    readonly children: UIElementChildren<RefPageTypes>;


    readonly name: string = "REF ";

    private readonly refFpl: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();
    private readonly refOther: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();


    constructor(props: PageProps) {
        super(props);

        this.children = new UIElementChildren<RefPageTypes>({
            wpt: new WaypointEditor({
                ...this.props,
                enterCallback: this.calcRef.bind(this),
                value: null,
                parent: this,
            }),
        });

        this.cursorController = new CursorController(this.children);
    }

    public render(): VNode {
        return (
            <div>
                <pre ref={this.refFpl} class="d-none">
                    <br/>
                    <br/>
                    ENTER REF<br/>
                    WPT:&nbsp&nbsp{this.children.get("wpt").render()}
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
        if (page instanceof FplPage) {
            this.refFpl.instance.classList.remove("d-none");
            this.refOther.instance.classList.add("d-none");
            this.children.get("wpt").isReadonly = false;
        } else {
            this.refFpl.instance.classList.add("d-none");
            this.refOther.instance.classList.remove("d-none");
            this.children.get("wpt").isReadonly = true;
            this.cursorController.setCursorActive(false);
        }
    }

    private async calcRef(wpt: Facility | null): Promise<void> {
        if (wpt === null) {
            return;
        }
        const ident = await getUniqueIdent(wpt.icaoStruct.ident, this.props.facilityLoader);
        if (ident === null) {
            this.props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "INVALID REF");
            return;
        }

        const mainPage = this.props.pageManager.getCurrentPage() as MainPage;
        const page = mainPage.getLeftPage() as FplPage;
        const fpl = this.props.memory.fplPage.flightplans[page.fplIdx];
        const closest = this.findClosestPoint(fpl, wpt);
        if (closest === null) {
            this.props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "INVALID REF");
            return;
        }

        // noinspection JSDeprecatedSymbols
        const facility: UserFacility = {
            icao: buildIcao('U', TEMPORARY_WAYPOINT, ident),
            icaoStruct: buildIcaoStruct('U', TEMPORARY_WAYPOINT, ident),
            name: "",
            lat: closest.point.lat,
            lon: closest.point.lon,
            region: TEMPORARY_WAYPOINT,
            city: "",
            isTemporary: false, //irrelevant, because this flag is not persisted
            userFacilityType: UserFacilityType.LAT_LONG,
            reference1IcaoStruct: wpt.icaoStruct,
            reference1Radial: closest.point.bearingFrom(wpt),
            reference1Distance: UnitType.GA_RADIAN.convertTo(closest.point.distance(wpt), UnitType.NMILE),
        };

        try {
            this.props.facilityRepository.add(facility);
        } catch (e) {
            this.props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "USR DB FULL");
            console.error(e);
            return;
        }
        page.insertRefWpt(facility, closest.legIdx);
        this.children.get("wpt").setValue(null);
    }


    private findClosestPoint(fpl: Flightplan, wpt: Facility): { point: GeoPoint, legIdx: number } | null {
        const legs = fpl.getLegs();
        if (legs.length < 2) {
            return null;
        }

        const circle = new GeoCircle(new Float64Array(3), 0);
        const tempGeoPoint = new GeoPoint(0, 0);
        let distMin = 99999; //This is GA Radians!
        const closestWpt = new GeoPoint(0, 0);
        let closestIdx = -1;
        for (let i = 1; i < legs.length; i++) {
            const from = legs[i - 1].wpt;
            const to = legs[i].wpt;
            tempGeoPoint.set(from);
            const distFromTo = tempGeoPoint.distance(to);
            const path = circle.setAsGreatCircle(from, to);
            path.closest(wpt, tempGeoPoint);
            const distFromClosest = tempGeoPoint.distance(from); //We use this to check, if closest is between from and to
            const distClosestWpt = tempGeoPoint.distance(wpt);
            if (distFromClosest <= distFromTo && distClosestWpt < distMin) {
                closestWpt.set(tempGeoPoint);
                distMin = distClosestWpt;
                closestIdx = i;
            }
        }

        if (closestIdx === -1) {
            return null;
        } else {
            return {
                point: closestWpt,
                legIdx: closestIdx,
            }
        }

    }


}