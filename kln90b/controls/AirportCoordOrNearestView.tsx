import {
    AirportFacility,
    AirportPrivateType,
    AirportUtils,
    BitFlags,
    BoundaryType,
    EventBus,
    FSComponent,
    LodBoundary,
    NodeReference,
    UnitType,
    VNode,
} from "@microsoft/msfs-sdk";
import {UiElement, UIElementChildren} from "../pages/Page";
import {LatitudeEditor} from "./editors/LatitudeEditor";
import {LongitudeEditor} from "./editors/LongitudeEditor";
import {BearingDisplay} from "./displays/BearingDisplay";
import {DistanceDisplay} from "./displays/DistanceDisplay";
import {NearestWpt} from "../data/navdata/NearestList";
import {isNearestWpt, isUserWaypoint, unpackFacility} from "../pages/right/WaypointPage";
import {Latitude} from "../data/Units";
import {TextDisplay} from "./displays/TextDisplay";
import {NearestUtils} from "../data/navdata/NearestUtils";
import {format} from "numerable";
import {getKLNLightingString, getKLNSurfaceString} from "../pages/right/Apt3ListPage";
import {KLNMagvar} from "../data/navdata/KLNMagvar";


type AirportCoordOrNearestViewTypes = {
    airportType: TextDisplay,

    lat: LatitudeEditor,
    lon: LongitudeEditor,

    longestRunwayLength: TextDisplay,
    longestRunwaySurface: TextDisplay,
    longestRunwayLighting: TextDisplay,

    bearing: BearingDisplay,
    distance: DistanceDisplay,

}

const AIRSPACE_B = 4;
const AIRSPACE_C = 3;
const AIRSPACE_TMA = 2;
const AIRSPACE_CTA = 1;
const AIRSPACE_NONE = 0;
const BOUNDARY_FLAGS = BitFlags.union(
    BitFlags.createFlag(BoundaryType.ClassA),
    BitFlags.createFlag(BoundaryType.ClassB),
    BitFlags.createFlag(BoundaryType.ClassC),
    BitFlags.createFlag(BoundaryType.ClassD),
    BitFlags.createFlag(BoundaryType.ClassE),
    BitFlags.createFlag(BoundaryType.ClassF),
    BitFlags.createFlag(BoundaryType.ClassG),
);

/**
 * Displays either the coordinates of a waypoint if the waypoint is from the normal list or the bearing/distance if it is
 * displayed from the normal list
 */
export class AirportCoordOrNearestView implements UiElement {


    readonly children: UIElementChildren<AirportCoordOrNearestViewTypes>;

    protected readonly coordRef: NodeReference<HTMLDivElement>;
    protected readonly nearestRef: NodeReference<HTMLDivElement>;


    constructor(bus: EventBus,
                private facility: AirportFacility | NearestWpt<AirportFacility> | null,
                private readonly magvar: KLNMagvar,
                setLatitude: (text: Latitude) => void,
                setLongitude: (text: Latitude) => void,
                private readonly nearestUtils: NearestUtils) {
        const unpacked = unpackFacility(facility);

        let longestRunway = null;
        if (unpacked) {
            longestRunway = AirportUtils.getLongestRunway(unpacked);
        }

        this.children = new UIElementChildren<AirportCoordOrNearestViewTypes>({
            lat: new LatitudeEditor(bus, unpacked ? unpacked.lat : null, setLatitude),
            lon: new LongitudeEditor(bus, unpacked ? unpacked.lon : null, setLongitude),
            airportType: new TextDisplay(this.formatAirportType([])),
            longestRunwayLength: new TextDisplay(longestRunway ? format(UnitType.METER.convertTo(longestRunway.length, UnitType.FOOT), "0").padStart(5, " ") : "     "),
            longestRunwaySurface: new TextDisplay(longestRunway ? getKLNSurfaceString(longestRunway) : "   "),
            longestRunwayLighting: new TextDisplay(longestRunway ? getKLNLightingString(longestRunway) : "   "),
            bearing: new BearingDisplay(),
            distance: new DistanceDisplay(5),
        });
        this.coordRef = FSComponent.createRef<HTMLDivElement>();
        this.nearestRef = FSComponent.createRef<HTMLDivElement>();

        this.loadAirspace();
    }

    render(): VNode {
        return (
            <div>
                <div ref={this.coordRef}>
                    {this.children.get("airportType").render()}<br/>
                    {this.children.get("lat").render()}'<br/>
                    {this.children.get("lon").render()}'
                </div>
                <div ref={this.nearestRef} class="d-none">
                    &nbsp{this.children.get("longestRunwayLength").render()}' {this.children.get("longestRunwaySurface").render()}<br/>
                    {this.children.get("longestRunwayLighting").render()}&nbsp&nbsp{this.children.get("bearing").render()}to<br/>
                    &nbsp&nbsp&nbsp&nbsp{this.children.get("distance").render()}nm
                </div>
            </div>);
    }

    public enableLatLon(lat: number | null, lon: number | null): void {
        this.children.get("lat").setValue(lat);
        this.children.get("lon").setValue(lon);

        this.children.get("lat").isReadonly = false;
        this.children.get("lon").isReadonly = false;
    }

    public setFacility(facility: AirportFacility | NearestWpt<AirportFacility> | null) {
        this.facility = facility;

        const unpacked = unpackFacility(facility);

        if (unpacked === null) {
            this.children.get("lat").setValue(null);
            this.children.get("lon").setValue(null);

            this.children.get("longestRunwayLength").text = "";
            this.children.get("longestRunwaySurface").text = "";
            this.children.get("longestRunwayLighting").text = "";

            this.children.get("lat").isReadonly = true;
            this.children.get("lon").isReadonly = true;
        } else {
            const isUserWpt = isUserWaypoint(unpacked);

            this.children.get("lat").setValue(unpacked.lat);
            this.children.get("lon").setValue(unpacked.lon);

            const rwy = AirportUtils.getLongestRunway(unpacked);
            if (rwy === null) {
                this.children.get("longestRunwayLength").text = "";
                this.children.get("longestRunwaySurface").text = "";
                this.children.get("longestRunwayLighting").text = "";
            } else {
                this.children.get("longestRunwayLength").text = format(UnitType.METER.convertTo(rwy.length, UnitType.FOOT), "0").padStart(5, " ");
                this.children.get("longestRunwaySurface").text = getKLNSurfaceString(rwy);
                this.children.get("longestRunwayLighting").text = getKLNLightingString(rwy);
            }

            this.children.get("lat").isReadonly = !isUserWpt;
            this.children.get("lon").isReadonly = !isUserWpt;
        }

        this.loadAirspace();
    }

    tick(blink: boolean): void {
        if (isNearestWpt(this.facility)) {
            this.nearestRef.instance.classList.remove("d-none");
            this.coordRef.instance.classList.add("d-none");
            this.children.get("bearing").bearing = this.magvar.trueToMag(this.facility.bearingToTrue);
            this.children.get("distance").distance = this.facility.distance;

            this.children.get("lat").isReadonly = true;
            this.children.get("lon").isReadonly = true;
        } else {
            this.nearestRef.instance.classList.add("d-none");
            this.coordRef.instance.classList.remove("d-none");
        }
    }

    private formatAirportType(airspaces: LodBoundary[]): string {
        let airspaceString = "     ";
        let maxAirspace = AIRSPACE_NONE;

        if (this.facility === null) {
            return "";
        }
        const apt = unpackFacility(this.facility);


        console.log(airspaces);

        if (airspaces) {
            for (const airspace of airspaces) {
                if (airspace.facility.name.includes("CTA")) {
                    maxAirspace = Math.max(maxAirspace, AIRSPACE_CTA);
                } else if (airspace.facility.name.includes("TMA")) {
                    maxAirspace = Math.max(maxAirspace, AIRSPACE_TMA);
                } else if (airspace.facility.type === BoundaryType.ClassB) {
                    maxAirspace = AIRSPACE_B;
                } else if (airspace.facility.type === BoundaryType.ClassC) {
                    maxAirspace = Math.max(maxAirspace, AIRSPACE_C);
                }
            }
        }

        switch (maxAirspace) {
            case AIRSPACE_B:
                airspaceString = "CL B";
                break;
            case AIRSPACE_C:
                airspaceString = "CL C";
                break;
            case AIRSPACE_TMA:
                airspaceString = "TMA ";
                break;
            case AIRSPACE_CTA:
                airspaceString = "CTA ";
                break;
            default:
                airspaceString = "    ";
        }

        let type;
        switch (apt.airportPrivateType) {
            case AirportPrivateType.Military:
                type = "MILTRY";
                break;
            case AirportPrivateType.Private:
                type = "PRIVAT";
                break;
            default:
                type = "";
        }

        return airspaceString + type;
    }

    private loadAirspace() {
        this.children.get("airportType").text = this.formatAirportType([]);

        const facility = unpackFacility(this.facility);

        if (!facility || isUserWaypoint(facility)) {
            this.children.get("airportType").text = "";
            return;
        }

        this.nearestUtils.getAirspaces(facility.lat, facility.lon, 10, 100, BOUNDARY_FLAGS).then(airspaces => {
            if (this.facility) {
                this.children.get("airportType").text = this.formatAirportType(airspaces);
            }
        });
    }


}