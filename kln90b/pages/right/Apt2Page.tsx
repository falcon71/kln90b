import {AirportFacility, FSComponent, GpsBoolean, NodeReference, UnitType, VNode} from '@microsoft/msfs-sdk';
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {AirportSelector} from "../../controls/selects/AirportSelector";
import {getRegionOrCountry} from "../../data/CountryMap";
import {isUserWaypoint, unpackFacility, WaypointPage} from "./WaypointPage";
import {WaypointPageState} from "../../data/VolatileMemory";
import {CreateWaypointMessage} from "../../controls/selects/CreateWaypointMessage";
import {StatusLineMessageEvents} from "../../controls/StatusLine";
import {Apt1Page} from "./Apt1Page";
import {ElevationEditor} from "../../controls/editors/ElevationEditor";
import {Scanlist} from "../../data/navdata/Scanlist";
import {NearestSelector} from "../../controls/selects/NearestSelector";
import {AirportNearestList, NearestWpt} from "../../data/navdata/NearestList";
import {ActiveArrow} from "../../controls/displays/ActiveArrow";
import {convertTextToKLNCharset} from "../../data/Text";
import {ElevationDisplay} from "../../controls/displays/AltitudeDisplay";


type Apt2PageTypes = {
    activeArrow: ActiveArrow,
    activeIdx: TextDisplay,
    apt: AirportSelector
    waypointType: TextDisplay,
    nearestSelector: NearestSelector,

    createWpt: CreateWaypointMessage,
    dbPage: Apt2DBPage,
    userPage: Apt2UserPage,

}


export class Apt2Page extends WaypointPage<AirportFacility> {

    public readonly cursorController;
    readonly children: UIElementChildren<Apt2PageTypes>;

    readonly name: string = "APT 2";

    constructor(props: PageProps) {
        super(props);

        const facility = unpackFacility(this.facility);

        console.log(this.facility);

        if (this.props.scanLists.aptScanlist.isEmpty()) {
            props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "NO APT WPTS");
        }


        this.children = new UIElementChildren<Apt2PageTypes>({
            activeArrow: new ActiveArrow(facility?.icao ?? null, this.props.memory.navPage),
            activeIdx: new TextDisplay(this.getActiveIdxText()),
            apt: new AirportSelector(this.props.bus, this.ident, this.props.facilityLoader, this.changeFacility.bind(this)),
            waypointType: new TextDisplay(this.activeIdx === -1 ? "" : "A"),
            nearestSelector: new NearestSelector(this.facility),
            dbPage: new Apt2DBPage(props),
            userPage: new Apt2UserPage(props),
            createWpt: new CreateWaypointMessage(() => Apt1Page.createAtUserPosition(props), () => Apt1Page.createAtPresentPosition(props)),
        });

        if (this.activeIdx !== -1) {
            this.children.get("apt").setReadonly(true);
        }
        this.cursorController = new CursorController(this.children);

    }

    public render(): VNode {
        this.requiresRedraw = true;
        //todo we're supposed to show the timezone
        return (<pre>
            {this.children.get("activeArrow").render()}{this.children.get("activeIdx").render()}{this.children.get("apt").render()}&nbsp&nbsp{this.children.get("waypointType").render()}{this.children.get("nearestSelector").render()}<br/>

            {this.children.get("dbPage").render()}
            {this.children.get("userPage").render()}
            {this.children.get("createWpt").render()}

        </pre>);
    }

    public getScanlist(): Scanlist {
        return this.props.scanLists.aptScanlist;
    }

    protected redraw() {
        const facility = unpackFacility(this.facility);
        this.children.get("nearestSelector").setFacility(this.facility);
        if (facility === null) {
            this.children.get("createWpt").setVisible(true);
        } else {
            this.children.get("createWpt").setVisible(false);
        }
    }

    protected changeFacility(fac: string | AirportFacility) {
        super.changeFacility(fac);
        this.children.get("activeArrow").icao = unpackFacility(this.facility)?.icao ?? null;
        this.children.get("apt").setValue(this.ident);
        this.children.get("dbPage").changeFacility(fac);
        this.children.get("userPage").changeFacility(fac);
    }

    protected getMemory(): WaypointPageState<AirportFacility> {
        return this.props.memory.aptPage;
    }

    protected getNearestList(): AirportNearestList {
        return this.props.nearestLists.aptNearestList;
    }
}


type Apt2DBPageTypes = {
    city1: TextDisplay,
    city2: TextDisplay,
    elevation: ElevationDisplay,
    approach: TextDisplay,
    radar: TextDisplay,
}


export class Apt2DBPage extends WaypointPage<AirportFacility> {

    public readonly cursorController;
    readonly children: UIElementChildren<Apt2DBPageTypes>;

    readonly name: string = "APT 2";

    protected readonly mainRef: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();

    constructor(props: PageProps) {
        super(props);


        console.log(this.facility);

        let city = "";
        let state = "";
        const facility = unpackFacility(this.facility);
        if (facility) {
            city = this.formatCity(facility);
            state = getRegionOrCountry(facility);
        }


        this.children = new UIElementChildren<Apt2DBPageTypes>({
            city1: new TextDisplay(this.multiline(city, state)[0]),
            city2: new TextDisplay(this.multiline(city, state)[1]),
            elevation: new ElevationDisplay(this.formatElevation(facility)),
            approach: new TextDisplay(this.formatApproach(facility)),
            radar: new TextDisplay(this.formatRadar(facility)),
        });

        this.cursorController = new CursorController(this.children);

    }


    public render(): VNode {
        this.requiresRedraw = true;
        //todo we're supposed to show the timezone
        return (<div ref={this.mainRef}>
            {this.children.get("city1").render()}<br/>
            {this.children.get("city2").render()}<br/>
            ELV {this.children.get("elevation").render()}ft<br/>
            <br/>
            {this.children.get("approach").render()}&nbsp{this.children.get("radar").render()}
        </div>);
    }

    public changeFacility(fac: NearestWpt<AirportFacility> | string | AirportFacility): void {
        super.changeFacility(fac);
    }

    public getScanlist(): Scanlist {
        return this.props.scanLists.aptScanlist;
    }

    protected redraw() {
        const facility = unpackFacility(this.facility);
        if (facility === null || isUserWaypoint(facility)) {
            this.mainRef.instance.classList.add("d-none");
        } else {
            this.mainRef.instance.classList.remove("d-none");
            const city = this.formatCity(facility);

            const state = getRegionOrCountry(facility);
            this.children.get("city1").text = this.multiline(city, state)[0];
            this.children.get("city2").text = this.multiline(city, state)[1];
            this.children.get("elevation").altitude = this.formatElevation(facility);
            this.children.get("approach").text = this.formatApproach(facility);
            this.children.get("radar").text = this.formatRadar(facility);
        }
    }

    protected getMemory(): WaypointPageState<AirportFacility> {
        return this.props.memory.aptPage;
    }

    protected getNearestList(): AirportNearestList {
        return this.props.nearestLists.aptNearestList;
    }

    private formatElevation(apt: AirportFacility | null): number | null {
        // @ts-ignore
        if (apt === null || apt.altitude === -1) {
            return null;
        }

        // @ts-ignore
        return Math.round(UnitType.METER.convertTo(apt.altitude, UnitType.FOOT) / 10) * 10;
    }

    private formatCity(apt: AirportFacility): string {
        const rawParts = apt.city.split(", ");

        return convertTextToKLNCharset(Utils.Translate(rawParts[0]));
    }

    private formatApproach(apt: AirportFacility | null): string {
        if (!apt || isUserWaypoint(apt)) {
            return "";
        }
        let hasILS = false;
        const hasMLS = false; //Not in navdata?
        let hasNP = false;

        for (const approach of apt.approaches) {
            switch (approach.approachType) {
                case ApproachType.APPROACH_TYPE_ILS:
                    hasILS = true;
                    break;
                case ApproachType.APPROACH_TYPE_GPS:
                case ApproachType.APPROACH_TYPE_LDA:
                case ApproachType.APPROACH_TYPE_LOCALIZER:
                case ApproachType.APPROACH_TYPE_NDB:
                case ApproachType.APPROACH_TYPE_LOCALIZER_BACK_COURSE:
                case ApproachType.APPROACH_TYPE_NDBDME:
                case ApproachType.APPROACH_TYPE_RNAV:
                case ApproachType.APPROACH_TYPE_SDF:
                case ApproachType.APPROACH_TYPE_VOR:
                case ApproachType.APPROACH_TYPE_VORDME:
                    hasNP = true;
                    break;
            }
        }

        if (hasILS && hasMLS) {
            return "ILS/MLS";
        } else if (hasILS) {
            return "ILS    ";
        } else if (hasMLS) {
            return "MLS    ";
        } else if (hasNP) {
            return "NP APR ";
        } else {
            return "NO APR ";
        }
    }

    private formatRadar(apt: AirportFacility | null): string {
        return apt?.radarCoverage == GpsBoolean.Yes ? "(R)" : "   ";
    }

    private multiline(city: string, state: string): [string, string] {
        const maxCity1Length = state.length == 0 ? 11 : 10 - state.length;
        if (city.length <= maxCity1Length) {
            return [
                city.substring(0, maxCity1Length).padEnd(maxCity1Length + 1, " ") + state,
                "",
            ]
        }

        const maxCity2Length = state.length == 0 ? 22 : 21 - state.length;
        return [
            city.substring(0, 11),
            city.substring(11, maxCity2Length).padEnd(maxCity2Length - 10, " ") + state,
        ];
    }
}


type Apt2UserPageTypes = {
    elevation: ElevationEditor,
}


export class Apt2UserPage extends WaypointPage<AirportFacility> {

    public readonly cursorController;
    readonly children: UIElementChildren<Apt2UserPageTypes>;

    readonly name: string = "APT 2";

    protected readonly mainRef: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();

    constructor(props: PageProps) {
        super(props);


        console.log(this.facility);

        const facility = unpackFacility(this.facility);

        this.children = new UIElementChildren<Apt2UserPageTypes>({
            elevation: new ElevationEditor(this.props.bus, this.formatElevation(facility), this.setElevation.bind(this)),
        });

        this.cursorController = new CursorController(this.children);

    }


    public render(): VNode {
        this.requiresRedraw = true;
        return (<div ref={this.mainRef}>
            <br/>
            <br/>
            ELV {this.children.get("elevation").render()}ft
        </div>);
    }

    public changeFacility(fac: NearestWpt<AirportFacility> | string | AirportFacility): void {
        super.changeFacility(fac);
    }

    public getScanlist(): Scanlist {
        return this.props.scanLists.aptScanlist;
    }

    protected redraw() {
        const facility = unpackFacility(this.facility);
        if (facility === null || !isUserWaypoint(facility)) {
            this.mainRef.instance.classList.add("d-none");
            this.children.get("elevation").isReadonly = true;
        } else {
            this.mainRef.instance.classList.remove("d-none");
            this.children.get("elevation").isReadonly = false;
            this.children.get("elevation").setValue(this.formatElevation(facility));
        }
    }

    protected getMemory(): WaypointPageState<AirportFacility> {
        return this.props.memory.aptPage;
    }

    protected getNearestList(): AirportNearestList {
        return this.props.nearestLists.aptNearestList;
    }

    private setElevation(elevation: number) {
        const facility = unpackFacility(this.facility);
        if (facility) {
            this.props.facilityLoader.facilityRepo.update(facility!,
                // @ts-ignore
                fac => fac.altitude = UnitType.FOOT.convertTo(elevation, UnitType.METER),
            );
        }
    }

    private formatElevation(apt: AirportFacility | null): number | null {
        // @ts-ignore
        if (apt === null || apt.altitude === -1) {
            return null;
        }

        // @ts-ignore
        return Math.round(UnitType.METER.convertTo(apt.altitude, UnitType.FOOT) / 10) * 10;
    }
}
