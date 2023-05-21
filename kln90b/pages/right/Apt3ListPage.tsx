import {
    AirportFacility, AirportRunway,
    FSComponent,
    NodeReference,
    RunwayLightingType,
    RunwaySurfaceType,
    RunwayUtils,
    UnitType,
    VNode,
} from '@microsoft/msfs-sdk';
import {PageProps, UIElementChildren} from "../Page";
import {NO_CURSOR_CONTROLLER} from "../CursorController";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {isUserWaypoint, unpackFacility, WaypointPage} from "./WaypointPage";
import {WaypointPageState} from "../../data/VolatileMemory";
import {Scanlist} from "../../data/navdata/Scanlist";
import {AirportNearestList} from "../../data/navdata/NearestList";


type Apt3ListPageTypes = {
    rwy0: TextDisplay,
    rwy1: TextDisplay,
    rwy2: TextDisplay,
    rwy3: TextDisplay,
}

/**
 * This is the apt3 page for a normal airport from the databse
 */
export class Apt3ListPage extends WaypointPage<AirportFacility> {

    public readonly cursorController = NO_CURSOR_CONTROLLER; //Is handled by Apt3ListPageContainer
    readonly children: UIElementChildren<Apt3ListPageTypes>;

    readonly name: string = "APT 3";
    private runways: string[] = [];

    private ref: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();
    private isVisible: boolean = false;

    constructor(props: PageProps) {
        super(props);


        const facility = unpackFacility(this.facility);
        this.buildRunwayList();

        this.children = new UIElementChildren<Apt3ListPageTypes>({
            rwy0: new TextDisplay(""),
            rwy1: new TextDisplay(""),
            rwy2: new TextDisplay(""),
            rwy3: new TextDisplay(""),
        });

        this.setVisible(facility !== null && !isUserWaypoint(facility));
    }


    public render(): VNode {
        return (<div ref={this.ref} class={this.isVisible ? "" : "d-none"}>
            <br/>
            {this.children.get("rwy0").render()}<br/>
            {this.children.get("rwy1").render()}<br/>
            {this.children.get("rwy2").render()}<br/>
            {this.children.get("rwy3").render()}
        </div>);
    }

    public changeFacility(fac: string | AirportFacility) {
        super.changeFacility(fac);
        this.currentPage = 0;
        const facility = unpackFacility(this.facility);
        this.setVisible(facility !== null && !isUserWaypoint(facility));
        this.buildRunwayList();
    }

    public getScanlist(): Scanlist {
        return this.props.scanLists.aptScanlist;
    }

    public setVisible(visible: boolean) {
        this.isVisible = visible;
    }

    protected redraw() {
        if (this.facility === null) {
            this.ref.instance.classList.add("d-none");
        } else {
            if (this.isVisible) {
                this.ref.instance.classList.remove("d-none");
            } else {
                this.ref.instance.classList.add("d-none");
            }

            if (this.runways.length > 0) {
                const startIndex = this.currentPage * 4;

                for (let i = 0; i < 4; i++) {
                    if (i + startIndex < this.runways.length) {
                        this.children.get(`rwy${i}` as any).text = this.runways[i + startIndex];
                    } else {
                        this.children.get(`rwy${i}` as any).text = "";
                    }

                }
            } else {
                this.children.get("rwy0").text = "  RUNWAY";
                this.children.get("rwy1").text = " DATA NOT";
                this.children.get("rwy2").text = " AVAILABLE";
                this.children.get("rwy3").text = "";
            }
        }
    }

    protected getMemory(): WaypointPageState<AirportFacility> {
        return this.props.memory.aptPage;
    }

    protected getNearestList(): AirportNearestList {
        return this.props.nearestLists.aptNearestList;
    }

    private buildRunwayList() {
        const facility = unpackFacility(this.facility);
        this.runways = [];
        facility?.runways.sort((a, b) => b.length - a.length).slice(0, 5).forEach((rwy, idx) => {
            const oneWayRunways = RunwayUtils.getOneWayRunways(rwy, idx);
            const name = oneWayRunways.map(r => r.designation.padEnd(3, " ")).join("/").padEnd(8);

            const lengthFeet = Math.round(UnitType.METER.convertTo(rwy.length, UnitType.FOOT));

            this.runways.push(name + getKLNLightingString(rwy));
            this.runways.push(`${lengthFeet.toString().padStart(6, " ")}' ${getKLNSurfaceString(rwy)}`);
        });

        this.numPages = Math.max(Math.ceil(this.runways.length / 4), 1);
        this.currentPage = 0;
    }
}

export function getKLNSurfaceString(runway: AirportRunway): string {
    switch (runway.surface) {
        case RunwaySurfaceType.Concrete:
        case RunwaySurfaceType.Asphalt:
        case RunwaySurfaceType.Bituminous:
        case RunwaySurfaceType.Brick:
        case RunwaySurfaceType.Tarmac:
            return "HRD";
        case RunwaySurfaceType.Grass:
        case RunwaySurfaceType.GrassBumpy:
        case RunwaySurfaceType.ShortGrass:
        case RunwaySurfaceType.LongGrass:
        case RunwaySurfaceType.HardTurf:
            return "TRF";
        case RunwaySurfaceType.Snow:
            return "SNW";
        case RunwaySurfaceType.Ice:
            return "ICE";
        case RunwaySurfaceType.Dirt:
            return "DRT";
        case RunwaySurfaceType.Gravel:
            return "GRV";
        case RunwaySurfaceType.SteelMats:
            return "MAT";
        case RunwaySurfaceType.Sand:
            return "SND";
        case RunwaySurfaceType.Shale:
            return "SHL";
        default:
            return "";
    }
}

export function getKLNLightingString(runway: AirportRunway): string {
    switch (runway.lighting) {
        case RunwayLightingType.FullTime:
            return "L  ";
        case RunwayLightingType.Frequency:
            return "LPC";
        case RunwayLightingType.PartTime:
            return "LPT";
        default:
            return "   ";
    }
}