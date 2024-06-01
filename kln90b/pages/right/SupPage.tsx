import {
    DebounceTimer,
    Facility,
    FSComponent,
    GeoPoint,
    ICAO,
    NodeReference,
    UnitType,
    UserFacility,
    UserFacilityType,
    VNode,
} from '@microsoft/msfs-sdk';
import {PageProps, PageSide, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {LatitudeEditor} from "../../controls/editors/LatitudeEditor";
import {LongitudeEditor} from "../../controls/editors/LongitudeEditor";
import {SupplementarySelector} from "../../controls/selects/SupplementarySelector";
import {WaypointEditor} from "../../controls/editors/WaypointEditor";
import {isUserWaypoint, unpackFacility, WaypointPage} from "./WaypointPage";
import {CreateWaypointMessage} from "../../controls/selects/CreateWaypointMessage";
import {WaypointPageState} from "../../data/VolatileMemory";
import {RadialEditor} from "../../controls/editors/RadialEditor";
import {DistanceEditor} from "../../controls/editors/DistanceEditor";
import {StatusLineMessageEvents} from "../../controls/StatusLine";
import {Scanlist} from "../../data/navdata/Scanlist";
import {ActiveArrow} from "../../controls/displays/ActiveArrow";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {TickController} from "../../TickController";
import {buildIcao, USER_WAYPOINT} from "../../data/navdata/IcaoBuilder";


type SupPageTypes = {
    activeArrow: ActiveArrow,
    activeIdx: TextDisplay,
    sup: SupplementarySelector

    waypointType: TextDisplay,
    ref: WaypointEditor,
    refBearing: RadialEditor,
    refDist: DistanceEditor,
    lat: LatitudeEditor,
    lon: LongitudeEditor,

    createWpt: CreateWaypointMessage,
}

const REF_CALCULATION_TIME = 8000; //yes, it's really that slow

interface UserSupplementary {
    lat: number | null,
    lon: number | null,
}

export class SupPage extends WaypointPage<UserFacility> {
    public readonly cursorController;
    readonly children: UIElementChildren<SupPageTypes>;

    readonly name: string = "SUP  ";
    protected readonly mainRef: NodeReference<HTMLDivElement>;
    private ref: Facility | null = null;
    private rad: number | null = null;
    private dis: number | null = null;
    private refDebounce = new DebounceTimer();
    private userSupplementary: UserSupplementary | null = null;

    constructor(props: PageProps) {
        super(props);

        if (this.props.scanLists.supScanlist.isEmpty()) {
            props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "NO SUP WPTS");
        }

        const facility = unpackFacility(this.facility);

        console.log(this.facility);


        this.children = new UIElementChildren<SupPageTypes>({
            activeArrow: new ActiveArrow(facility?.icao ?? null, this.props.memory.navPage),
            activeIdx: new TextDisplay(this.getActiveIdxText()),
            sup: new SupplementarySelector(this.props.bus, this.ident, this.props.facilityLoader, this.changeFacility.bind(this)),
            waypointType: new TextDisplay(this.activeIdx === -1 ? "" : "S"),
            ref: new WaypointEditor({
                ...this.props,
                enterCallback: this.setRef.bind(this),
                emptyFieldValue: null,
                pageSite: PageSide.RightPage,
                parent: this,
            }),
            refBearing: new RadialEditor(this.props.bus, null, this.setRad.bind(this)),
            refDist: new DistanceEditor(this.props.bus, null, this.setDist.bind(this)),
            lat: new LatitudeEditor(this.props.bus, facility ? facility.lat : null, this.setLatitude.bind(this)),
            lon: new LongitudeEditor(this.props.bus, facility ? facility.lon : null, this.setLongitude.bind(this)),
            createWpt: new CreateWaypointMessage(this.createAtUserPosition.bind(this), this.createAtPresentPosition.bind(this)),
        });

        this.mainRef = FSComponent.createRef<HTMLDivElement>();

        if (this.activeIdx !== -1) {
            this.children.get("sup").setReadonly(true);
        }

        this.calculateRef();

        this.cursorController = new CursorController(this.children);

    }


    public render(): VNode {
        this.requiresRedraw = true;
        return (<pre>
            {this.children.get("activeArrow").render()}{this.children.get("activeIdx").render()}{this.children.get("sup").render()} {this.children.get("waypointType").render()}<br/>
            <div ref={this.mainRef}>
            REF:&nbsp&nbsp{this.children.get("ref").render()}<br/>
            RAD: {this.children.get("refBearing").render()}°<br/>
            DIS:{this.children.get("refDist").render()}NM<br/>
                {this.children.get("lat").render()}'<br/>
                {this.children.get("lon").render()}'
            </div>
            {this.children.get("createWpt").render()}
        </pre>);
    }

    public getScanlist(): Scanlist {
        return this.props.scanLists.supScanlist;
    }

    protected changeFacility(fac: string | UserFacility) {
        super.changeFacility(fac);
        this.children.get("sup").setValue(this.ident);
        this.children.get("activeArrow").icao = unpackFacility(this.facility)?.icao ?? null;
        this.userSupplementary = null;

        this.calculateRef();
    }

    protected redraw() {
        if (!TickController.checkRef(this.mainRef)) {
            return;
        }

        const facility = unpackFacility(this.facility);
        if (facility === null) {
            if (this.userSupplementary === null) {
                this.children.get("ref").isReadonly = true;
                this.children.get("refBearing").isReadonly = true;
                this.children.get("refDist").isReadonly = true;
                this.children.get("lat").isReadonly = true;
                this.children.get("lon").isReadonly = true;


                this.mainRef.instance.classList.add("d-none");
                this.children.get("createWpt").setVisible(true);
            } else {

                this.children.get("ref").setValue(this.ref);
                this.children.get("refBearing").setValue(this.rad);
                this.children.get("refDist").setValue(this.dis);


                this.children.get("lat").setValue(this.userSupplementary.lat);
                this.children.get("lon").setValue(this.userSupplementary.lon);

                this.children.get("ref").isReadonly = false;
                this.children.get("refBearing").isReadonly = false;
                this.children.get("refDist").isReadonly = false;
                this.children.get("lat").isReadonly = false;
                this.children.get("lon").isReadonly = false;


                this.mainRef.instance.classList.remove("d-none");
                this.children.get("createWpt").setVisible(false);
            }
        } else {
            this.mainRef.instance.classList.remove("d-none");
            this.children.get("createWpt").setVisible(false);
            this.children.get("ref").setValue(this.ref);
            this.children.get("refBearing").setValue(this.rad);
            this.children.get("refDist").setValue(this.dis);


            this.children.get("lat").setValue(facility.lat);
            this.children.get("lon").setValue(facility.lon);

            const isUserWpt = isUserWaypoint(facility);

            this.children.get("ref").isReadonly = false;
            this.children.get("refBearing").isReadonly = !isUserWpt;
            this.children.get("refDist").isReadonly = !isUserWpt;
            this.children.get("lat").isReadonly = !isUserWpt;
            this.children.get("lon").isReadonly = !isUserWpt;
        }
    }

    protected getMemory(): WaypointPageState<UserFacility> {
        return this.props.memory.supPage;
    }

    protected getNearestList(): null {
        return null;
    }

    private setRef(ref: Facility | null) {
        this.ref = ref;
        this.requiresRedraw = true;
    }

    private calculateRef() {
        this.ref = null;
        this.rad = null;
        this.dis = null;
        if (!this.facility) {
            this.refDebounce.clear();
            return;
        }
        const facility = unpackFacility(this.facility);
        if (facility.reference1Icao !== undefined) {
            this.props.facilityLoader.getFacility(ICAO.getFacilityType(facility.reference1Icao), facility.reference1Icao).then(ref => {
                this.ref = ref; //5-22 This is only set for REF Waypoints
                this.dis = facility.reference1Distance!;
                this.rad = facility.reference1Radial!;
                this.requiresRedraw = true;
            });
            return;
        }

        this.refDebounce.schedule(async () => {
            //We do not use the provided nearestVorICAO, because that does not respect user VORs!
            const facility = unpackFacility(this.facility);
            if (facility) {
                this.ref = await this.props.nearestUtils.getNearestVor(facility.lat, facility.lon);
                if (this.ref) {
                    const refCoords = new GeoPoint(this.ref.lat, this.ref.lon);
                    const intCoords = new GeoPoint(facility.lat, facility.lon);
                    this.dis = UnitType.GA_RADIAN.convertTo(intCoords.distance(refCoords), UnitType.NMILE);
                    this.rad = intCoords.bearingFrom(refCoords);
                }
                this.requiresRedraw = true;
            }
        }, REF_CALCULATION_TIME);
    }

    private setRad(radial: number) {
        const facility = unpackFacility(this.facility);
        if (facility) {
            this.rad = radial;

            this.props.facilityLoader.facilityRepo.update(facility, fac => {
                const refCoords = new GeoPoint(this.ref!.lat, this.ref!.lon);
                const newCoords = refCoords.offset(radial, UnitType.NMILE.convertTo(this.dis!, UnitType.GA_RADIAN), new GeoPoint(0, 0));
                fac.lat = newCoords.lat;
                fac.lon = newCoords.lon;
            });
        } else {
            this.rad = radial;
            this.createIfReady();
        }
    }

    private setDist(dist: number) {
        const facility = unpackFacility(this.facility);
        if (facility) {
            this.dis = dist;
            this.props.facilityLoader.facilityRepo.update(facility!, fac => {
                const refCoords = new GeoPoint(this.ref!.lat, this.ref!.lon);
                const newCoords = refCoords.offset(this.rad!, UnitType.NMILE.convertTo(dist, UnitType.GA_RADIAN), new GeoPoint(0, 0));
                fac.lat = newCoords.lat;
                fac.lon = newCoords.lon;
            });
        } else {
            this.dis = dist;
            this.createIfReady();
        }
    }

    private setLatitude(latitude: number) {
        const facility = unpackFacility(this.facility);
        if (facility) {
            this.props.facilityLoader.facilityRepo.update(facility!, fac => fac.lat = latitude);
        } else {
            this.userSupplementary!.lat = latitude;
            this.createIfReady();
        }
    }

    private setLongitude(longitude: number) {
        const facility = unpackFacility(this.facility);
        if (facility) {
            this.props.facilityLoader.facilityRepo.update(facility!, fac => fac.lon = longitude);
        } else {
            this.userSupplementary!.lon = longitude;
            this.createIfReady();
        }
    }

    private createAtUserPosition(): void {
        this.ref = null;
        this.rad = null;
        this.dis = null;
        this.userSupplementary = {
            lat: null,
            lon: null,
        };

        //We need to position the cursor over the lat field. But we can't do so without setting the readonly state for all fields
        this.children.get("ref").isReadonly = false;
        this.children.get("refBearing").isReadonly = false;
        this.children.get("refDist").isReadonly = false;
        this.children.get("lat").isReadonly = false;
        this.children.get("lon").isReadonly = false;
        this.children.get("createWpt").setVisible(false);
        this.cursorController.focusIndex(7);

        this.requiresRedraw = true;
    }

    /**
     * 5-19
     * @private
     */
    private createIfReady() {
        let lat = this.userSupplementary!.lat;
        let lon = this.userSupplementary!.lon;
        let calcRef = true;

        if (this.ref !== null && this.rad !== null && this.dis !== null) {
            const refCoords = new GeoPoint(this.ref.lat, this.ref.lon);
            const newCoords = refCoords.offset(this.rad, UnitType.NMILE.convertTo(this.dis, UnitType.GA_RADIAN), new GeoPoint(0, 0));
            lat = newCoords.lat;
            lon = newCoords.lon;
            calcRef = false;

            this.children.get("lat").setValue(lat);
            this.children.get("lon").setValue(lon);
        }

        if (lat === null || lon === null) {
            this.props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "ENT LAT/LON");
            return;
        }

        this.facility = {
            icao: buildIcao('U', USER_WAYPOINT, this.ident),
            name: "",
            lat: lat,
            lon: lon,
            region: USER_WAYPOINT,
            city: "",
            magvar: 0,
            isTemporary: false,
            userFacilityType: UserFacilityType.LAT_LONG,
        };
        try {
            this.props.facilityLoader.facilityRepo.add(this.facility);
        } catch (e) {
            this.props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "USR DB FULL");
            console.error(e);
        }
        this.props.memory.supPage.facility = this.facility;
        this.cursorController.setCursorActive(false);

        if (calcRef) {
            this.calculateRef();
        }
    }

    private createAtPresentPosition(): void {
        this.facility = {
            icao: buildIcao('U', USER_WAYPOINT, this.ident),
            name: "",
            lat: this.props.sensors.in.gps.coords.lat,
            lon: this.props.sensors.in.gps.coords.lon,
            region: USER_WAYPOINT,
            city: "",
            magvar: 0,
            isTemporary: false,
            userFacilityType: UserFacilityType.LAT_LONG,
        };
        try {
            this.props.facilityLoader.facilityRepo.add(this.facility);
        } catch (e) {
            this.props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "USR DB FULL");
            console.error(e);
        }
        this.props.memory.supPage.facility = this.facility;
        this.cursorController.setCursorActive(false);
        this.calculateRef();
        this.requiresRedraw = true;
    }
}