import {
    AirportFacility,
    AirportRunway,
    FSComponent,
    NodeReference,
    RunwaySurfaceType,
    UnitType,
    VNode,
} from '@microsoft/msfs-sdk';
import {PageProps, UIElementChildren} from "../Page";
import {NO_CURSOR_CONTROLLER} from "../CursorController";
import {isUserWaypoint, unpackFacility, WaypointPage} from "./WaypointPage";
import {WaypointPageState} from "../../data/VolatileMemory";
import {RunwayLengthEditor} from "../../controls/editors/ElevationEditor";
import {RunwaySurfaceEditor} from "../../controls/editors/RunwaySurfaceEditor";
import {Scanlist} from "../../data/navdata/Scanlist";
import {AirportNearestList} from "../../data/navdata/NearestList";


type Apt3UserPageTypes = {
    length: RunwayLengthEditor,
    surface: RunwaySurfaceEditor,
}

type UserAirportRunway = {
    -readonly [K in keyof AirportRunway]: AirportRunway[K]
}

/**
 * 5-17 This is the apt3 page for a userAirport
 */
export class Apt3UserPage extends WaypointPage<AirportFacility> {

    public readonly cursorController = NO_CURSOR_CONTROLLER; //Is handled by Apt3ListPageContainer
    readonly children: UIElementChildren<Apt3UserPageTypes>;

    readonly name: string = "APT 3";
    private ref: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();
    private isVisible: boolean = false;


    constructor(props: PageProps) {
        super(props);


        const facility = unpackFacility(this.facility);

        this.children = new UIElementChildren<Apt3UserPageTypes>({
            length: new RunwayLengthEditor(this.props.bus, facility ? this.getRunwayLength(this.getRunway(facility)) : null, this.setRunwayLength.bind(this)),
            surface: new RunwaySurfaceEditor(this.props.bus, facility ? this.getRunwaySurface(this.getRunway(facility)) : null, this.setRunwaySurface.bind(this)),
        });


        this.setVisible(facility !== null && isUserWaypoint(facility));

    }

    public render(): VNode {
        return (<div ref={this.ref} class={this.isVisible ? "" : "d-none"}>
            <br/>
            RWY LEN <br/>
            &nbsp{this.children.get("length").render()}' {this.children.get("surface").render()}<br/>
            <br/>
        </div>);
    }

    public changeFacility(fac: string | AirportFacility) {
        super.changeFacility(fac);
        this.currentPage = 0;
        const facility = unpackFacility(this.facility);
        this.setVisible(facility !== null && isUserWaypoint(facility));
    }

    public getScanlist(): Scanlist {
        return this.props.scanLists.aptScanlist;
    }

    public setVisible(visible: boolean) {
        this.isVisible = visible;

        this.children.get("length").isReadonly = !visible;
        this.children.get("surface").isReadonly = !visible;
    }

    protected redraw() {
        const facility = unpackFacility(this.facility);
        if (facility === null) {
            this.ref.instance.classList.add("d-none");
        } else {
            if (this.isVisible) {
                this.ref.instance.classList.remove("d-none");
            } else {
                this.ref.instance.classList.add("d-none");
            }
            if (this.facility && isUserWaypoint(facility)) {
                this.children.get("length").setValue(this.getRunwayLength(this.getRunway(facility)));
                this.children.get("surface").setValue(this.getRunwaySurface(this.getRunway(facility)));
            }
        }
    }

    protected getMemory(): WaypointPageState<AirportFacility> {
        return this.props.memory.aptPage;
    }

    protected getNearestList(): AirportNearestList {
        return this.props.nearestLists.aptNearestList;
    }

    private getRunway(facility: AirportFacility): AirportRunway {
        return facility.runways[0];
    }

    private getRunwayLength(rwy: AirportRunway): number | null {
        if (rwy.length === -1) {
            return null;
        }
        return UnitType.METER.convertTo(rwy.length, UnitType.FOOT);
    }

    private getRunwaySurface(rwy: AirportRunway): RunwaySurfaceType | null {
        if (rwy.surface === RunwaySurfaceType.WrightFlyerTrack) {
            return null;
        }
        return rwy.surface;
    }

    private setRunwayLength(runwayLength: number) {
        const facility = unpackFacility(this.facility);
        this.props.facilityLoader.facilityRepo.update(facility!, fac => {
            const rwy = fac.runways[0] as UserAirportRunway;
            rwy.length = UnitType.FOOT.convertTo(runwayLength, UnitType.METER);
        });
    }

    private setRunwaySurface(surface: RunwaySurfaceType) {
        const facility = unpackFacility(this.facility);
        this.props.facilityLoader.facilityRepo.update(facility!, fac => {
            const rwy = fac.runways[0] as UserAirportRunway;
            rwy.surface = surface;
        });
    }
}