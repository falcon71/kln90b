import {
    AirportFacility,
    AirportPrivateType,
    FacilityFrequencyType,
    FSComponent,
    GpsBoolean,
    ICAO,
    LandingSystemCategory,
    NodeReference,
    RunwayLightingType,
    RunwaySurfaceType,
    VNode,
} from '@microsoft/msfs-sdk';
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {AirportSelector} from "../../controls/selects/AirportSelector";
import {unpackFacility, WaypointPage} from "./WaypointPage";
import {CreateWaypointMessage} from "../../controls/selects/CreateWaypointMessage";
import {WaypointPageState} from "../../data/VolatileMemory";
import {StatusLineMessageEvents} from "../../controls/StatusLine";
import {MainPage} from "../MainPage";
import {Scanlist} from '../../data/navdata/Scanlist';
import {NearestSelector} from "../../controls/selects/NearestSelector";
import {AirportNearestList} from "../../data/navdata/NearestList";
import {AirportCoordOrNearestView} from "../../controls/AirportCoordOrNearestView";
import {ActiveArrow} from "../../controls/displays/ActiveArrow";
import {convertTextToKLNCharset} from "../../data/Text";
import {buildIcao, buildIcaoStruct, USER_WAYPOINT} from "../../data/navdata/IcaoBuilder";


type Apt1PageTypes = {
    activeArrow: ActiveArrow,
    activeIdx: TextDisplay,
    apt: AirportSelector,
    waypointType: TextDisplay,
    nearestSelector: NearestSelector,

    name1: TextDisplay,
    name2: TextDisplay,

    coordOrNearestView: AirportCoordOrNearestView,

    createWpt: CreateWaypointMessage,
}


interface UserAirport {
    lat: number | null,
    lon: number | null,
}

type CreateMode = "PresentPos" | "UserPos";

interface Apt1PageProps extends PageProps {
    create: CreateMode
}

function isApt1PageProps(props: PageProps): props is Apt1PageProps {
    return "create" in props;
}


export class Apt1Page extends WaypointPage<AirportFacility> {

    public readonly cursorController;
    readonly children: UIElementChildren<Apt1PageTypes>;

    readonly name: string = "APT 1";

    protected readonly mainRef: NodeReference<HTMLDivElement>;

    private userAirport: UserAirport | null = null;

    constructor(props: PageProps) {
        super(props);

        console.log(this.facility);

        if (this.props.scanLists.aptScanlist.isEmpty()) {
            props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "NO APT WPTS");
        }

        let name = "";
        const facility = unpackFacility(this.facility);

        if (facility) {
            name = this.formatAirportName(Utils.Translate(facility.name));
        }

        this.children = new UIElementChildren<Apt1PageTypes>({
            activeArrow: new ActiveArrow(facility?.icaoStruct ?? null, this.props.memory.navPage),
            activeIdx: new TextDisplay(this.getActiveIdxText()),
            apt: new AirportSelector(this.props.bus, this.ident, this.props.facilityLoader, this.changeFacility.bind(this)),
            waypointType: new TextDisplay(this.activeIdx === -1 ? "" : "A"),
            nearestSelector: new NearestSelector(this.facility),
            name1: new TextDisplay(this.multiline(name)[0]),
            name2: new TextDisplay(this.multiline(name)[1]),
            type: new TextDisplay(""),
            coordOrNearestView: new AirportCoordOrNearestView(this.props.bus, this.facility, this.props.magvar, this.setLatitude.bind(this), this.setLongitude.bind(this), this.props.nearestUtils),
            createWpt: new CreateWaypointMessage(this.createAtUserPosition.bind(this), this.createAtPresentPosition.bind(this)),
        });

        this.mainRef = FSComponent.createRef<HTMLDivElement>();

        if (this.activeIdx !== -1) {
            this.children.get("apt").setReadonly(true);
        }

        this.cursorController = new CursorController(this.children);

        if (isApt1PageProps(props)) {
            if (props.create == "PresentPos") {
                this.createAtPresentPosition();
            } else {
                this.cursorController.setCursorActive(true);
                this.createAtUserPosition();
            }
        }

    }

    public static createAtUserPosition(props: PageProps): void {
        const actualProps: Apt1PageProps = {
            ...props,
            create: "UserPos",
        };
        const page = new Apt1Page(actualProps);
        const mainPage = props.pageManager.getCurrentPage() as MainPage;
        mainPage.setRightPage(page);
    }

    public static createAtPresentPosition(props: PageProps): void {
        const actualProps: Apt1PageProps = {
            ...props,
            create: "PresentPos",
        };
        const page = new Apt1Page(actualProps);
        const mainPage = props.pageManager.getCurrentPage() as MainPage;
        mainPage.setRightPage(page);
    }

    public render(): VNode {
        this.requiresRedraw = true;
        return (<pre>
            {this.children.get("activeArrow").render()}{this.children.get("activeIdx").render()}{this.children.get("apt").render()}&nbsp&nbsp{this.children.get("waypointType").render()}{this.children.get("nearestSelector").render()}<br/>
            <div ref={this.mainRef}>
                {this.children.get("name1").render()}<br/>
                {this.children.get("name2").render()}<br/>
                {this.children.get("coordOrNearestView").render()}
            </div>
            {this.children.get("createWpt").render()}
        </pre>);
    }

    public getScanlist(): Scanlist {
        return this.props.scanLists.aptScanlist;
    }

    protected changeFacility(fac: string | AirportFacility) {
        super.changeFacility(fac);
        this.children.get("apt").setValue(this.ident);
        this.children.get("activeArrow").icao = unpackFacility(this.facility)?.icaoStruct ?? null;
        this.children.get("coordOrNearestView").setFacility(this.facility);
        this.userAirport = null;
    }

    protected redraw() {
        const facility = unpackFacility(this.facility);
        this.children.get("nearestSelector").setFacility(this.facility);
        this.children.get("coordOrNearestView").setFacility(this.facility);
        if (facility === null) {
            if (this.userAirport === null) {
                this.mainRef.instance.classList.add("d-none");
                this.children.get("createWpt").setVisible(true);
            } else {
                this.mainRef.instance.classList.remove("d-none");
                this.children.get("createWpt").setVisible(false);
            }
        } else {
            this.mainRef.instance.classList.remove("d-none");
            this.children.get("createWpt").setVisible(false);

            const name = this.formatAirportName(Utils.Translate(facility.name));
            this.children.get("name1").text = this.multiline(name)[0];
            this.children.get("name2").text = this.multiline(name)[1];
        }
    }

    protected getMemory(): WaypointPageState<AirportFacility> {
        return this.props.memory.aptPage;
    }

    protected getNearestList(): AirportNearestList {
        return this.props.nearestLists.aptNearestList;
    }

    private setLatitude(latitude: number) {
        const facility = unpackFacility(this.facility);
        if (facility) {
            this.props.facilityRepository.update(facility, fac => fac.lat = latitude);
        } else {
            this.userAirport!.lat = latitude;
            this.createIfReady();
        }
    }

    private setLongitude(longitude: number) {
        const facility = unpackFacility(this.facility);
        if (facility) {
            this.props.facilityRepository.update(facility, fac => fac.lon = longitude);
        } else {
            this.userAirport!.lon = longitude;
            this.createIfReady();
        }
    }

    private createAtUserPosition(): void {
        this.userAirport = {
            lat: null,
            lon: null,
        };

        //We need to position the cursor over the lat field. But we can't do so without setting the readonly state for all fields
        this.children.get("coordOrNearestView").enableLatLon(null, null);
        this.children.get("createWpt").setVisible(false);
        this.cursorController.focusIndex(4);

        this.requiresRedraw = true;
    }

    /**
     * 5-19
     * @private
     */
    private createIfReady() {
        if (this.userAirport!.lat === null || this.userAirport!.lon === null) {
            this.props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "ENT LAT/LON");
            return;
        }

        this.facility = this.buildAirportFacility(this.userAirport!.lat, this.userAirport!.lon);
        try {
            this.props.facilityRepository.add(this.facility!);
        } catch (e) {
            this.props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "USR DB FULL");
            console.error(e);
        }
        this.props.memory.aptPage.facility = this.facility;
        this.cursorController.setCursorActive(false);
    }

    private createAtPresentPosition(): void {
        this.facility = this.buildAirportFacility(this.props.sensors.in.gps.coords.lat, this.props.sensors.in.gps.coords.lon);

        try {
            this.props.facilityRepository.add(this.facility!);
        } catch (e) {
            this.props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "USR DB FULL");
            console.error(e);
        }
        this.props.memory.aptPage.facility = this.facility;
        this.cursorController.setCursorActive(false);
        this.requiresRedraw = true;
    }

    private buildAirportFacility(lat: number, lon: number): AirportFacility {
        // noinspection JSDeprecatedSymbols
        return {
            icao: buildIcao('A', USER_WAYPOINT, this.ident),
            icaoStruct: buildIcaoStruct('A', USER_WAYPOINT, this.ident),
            name: "",
            lat: lat,
            lon: lon,
            region: USER_WAYPOINT,
            city: "",
            magvar: 0,
            airportPrivateType: AirportPrivateType.Uknown,
            fuel1: "",
            fuel2: "",
            bestApproach: "",
            radarCoverage: GpsBoolean.Unknown,
            airspaceType: 0,
            airportClass: 0,
            towered: false,
            frequencies: [],
            runways: [{
                latitude: lat,
                longitude: lon,
                elevation: 0,
                direction: 0,
                designation: "18-36",
                length: -10,
                width: 0,
                surface: RunwaySurfaceType.WrightFlyerTrack,
                lighting: RunwayLightingType.Unknown,
                designatorCharPrimary: RunwayDesignator.RUNWAY_DESIGNATOR_NONE,
                designatorCharSecondary: RunwayDesignator.RUNWAY_DESIGNATOR_NONE,
                primaryBlastpadLength: 0,
                primaryOverrunLength: 0,
                secondaryOverrunLength: 0,
                secondaryBlastpadLength: 0,
                primaryILSFrequency: {
                    icao: "",
                    icaoStruct: ICAO.emptyValue(),
                    name: "",
                    freqMHz: 0,
                    freqBCD16: 0,
                    type: FacilityFrequencyType.None,
                    hasGlideslope: false,
                    glideslopeAngle: 0,
                    localizerCourse: 0,
                    magvar: 0,
                    hasBackcourse: false,
                    glideslopeAlt: 0,
                    glideslopeLat: 0,
                    glideslopeLon: 0,
                    lsCategory: LandingSystemCategory.None,
                    localizerWidth: 0,
                },
                secondaryILSFrequency: {
                    icao: "",
                    icaoStruct: ICAO.emptyValue(),
                    name: "",
                    freqMHz: 0,
                    freqBCD16: 0,
                    type: FacilityFrequencyType.None,
                    hasGlideslope: false,
                    glideslopeAngle: 0,
                    localizerCourse: 0,
                    magvar: 0,
                    hasBackcourse: false,
                    glideslopeAlt: 0,
                    glideslopeLat: 0,
                    glideslopeLon: 0,
                    lsCategory: LandingSystemCategory.None,
                    localizerWidth: 0,
                },
                primaryElevation: 0,
                primaryThresholdLength: 0,
                secondaryElevation: 0,
                secondaryThresholdLength: 0,
            }],
            departures: [],
            approaches: [],
            arrivals: [],
            // @ts-ignore
            altitude: -1,
        };
    }

    private formatAirportName(name: string): string {
        name = convertTextToKLNCharset(name);

        name = name.replace("NORTHWEST", "NW");
        name = name.replace("NORTHEAST", "NE");
        name = name.replace("SOUTHWEST", "SW");
        name = name.replace("SOUTHEAST", "SE");

        name = name.replace("NORTHERN", "N");
        name = name.replace("NORTH", "N");
        name = name.replace("EASTERN", "E");
        name = name.replace("EAST", "E");
        name = name.replace("SOUTHERN", "S");
        name = name.replace("SOUTH", "S");
        name = name.replace("WESTERN", "W");
        name = name.replace("WEST", "W");

        name = name.replace("POINT", "PT");
        name = name.replace("PORT", "PT");
        name = name.replace("FORT", "FT");
        name = name.replace("SAINT", "ST");
        name = name.replace("GENERAL", "GEN");
        name = name.replace("CITY OF", "");
        name = name.replace("GREATER", "");
        name = name.replace("THE", "");

        name = name.replace(".", "");
        name = name.replace(",", "");
        name = name.replace(":", "");
        name = name.replace("'", "");

        name = name.replace("INTERNATIONAL", "INT");
        name = name.replace("REGIONAL", "REG");

        return name;
    }

    private multiline(name: string): [string, string] {
        return [name.substring(0, 11), name.substring(11, 22)];
    }


}