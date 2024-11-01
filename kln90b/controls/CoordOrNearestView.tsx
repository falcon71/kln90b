import {EventBus, Facility, FSComponent, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {UiElement, UIElementChildren} from "../pages/Page";
import {LatitudeEditor} from "./editors/LatitudeEditor";
import {LongitudeEditor} from "./editors/LongitudeEditor";
import {BearingDisplay} from "./displays/BearingDisplay";
import {DistanceDisplay} from "./displays/DistanceDisplay";
import {NearestWpt} from "../data/navdata/NearestList";
import {isNearestWpt, isUserWaypoint, unpackFacility} from "../pages/right/WaypointPage";
import {Latitude} from "../data/Units";
import {KLNMagvar} from "../data/navdata/KLNMagvar";


type CoordOrNearestViewTypes = {
    lat: LatitudeEditor,
    lon: LongitudeEditor,

    bearing: BearingDisplay,
    distance: DistanceDisplay,

}

/**
 * Displays either the coordinates of a waypoint if the waypoint is from the normal list or the bearing/distance if it is
 * displayed from the normal list
 */
export class CoordOrNearestView implements UiElement {


    readonly children: UIElementChildren<CoordOrNearestViewTypes>;

    protected readonly coordRef: NodeReference<HTMLDivElement>;
    protected readonly nearestRef: NodeReference<HTMLDivElement>;


    constructor(bus: EventBus,
                private facility: Facility | NearestWpt<Facility> | null,
                private readonly magvar: KLNMagvar,
                setLatitude: (text: Latitude) => void,
                setLongitude: (text: Latitude) => void) {
        const unpacked = unpackFacility(facility);

        this.children = new UIElementChildren<CoordOrNearestViewTypes>({
            lat: new LatitudeEditor(bus, unpacked ? unpacked.lat : null, setLatitude),
            lon: new LongitudeEditor(bus, unpacked ? unpacked.lon : null, setLongitude),
            bearing: new BearingDisplay(),
            distance: new DistanceDisplay(5),
        });
        this.coordRef = FSComponent.createRef<HTMLDivElement>();
        this.nearestRef = FSComponent.createRef<HTMLDivElement>();
    }


    render(): VNode {
        return (
            <div>
                <div ref={this.coordRef}>
                    {this.children.get("lat").render()}'<br/>
                    {this.children.get("lon").render()}'
                </div>
                <div ref={this.nearestRef} class="d-none">
                    &nbsp&nbsp&nbsp&nbsp&nbsp{this.children.get("bearing").render()}to<br/>
                    &nbsp&nbsp&nbsp&nbsp{this.children.get("distance").render()}nm
                </div>
            </div>);
    }

    public setFacility(facility: Facility | NearestWpt<Facility> | null) {
        this.facility = facility;

        const unpacked = unpackFacility(facility);

        if (unpacked === null) {
            this.children.get("lat").setValue(null);
            this.children.get("lon").setValue(null);
            this.children.get("lat").isReadonly = false;
            this.children.get("lon").isReadonly = false;
        } else {
            const isUserWpt = isUserWaypoint(unpacked);

            this.children.get("lat").setValue(unpacked.lat);
            this.children.get("lon").setValue(unpacked.lon);

            this.children.get("lat").isReadonly = !isUserWpt;
            this.children.get("lon").isReadonly = !isUserWpt;
        }
    }

    tick(blink: boolean): void {
        if (isNearestWpt(this.facility) && this.facility.index > -1) {
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


}