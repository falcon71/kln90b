import {AirportFacility, FSComponent, NodeReference, VNode} from '@microsoft/msfs-sdk';
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {AirportSelector} from "../../controls/selects/AirportSelector";
import {isNearestWpt, unpackFacility, WaypointPage} from "./WaypointPage";
import {WaypointPageState} from "../../data/VolatileMemory";
import {CreateWaypointMessage} from "../../controls/selects/CreateWaypointMessage";
import {Apt1Page} from "./Apt1Page";
import {StatusLineMessageEvents} from "../../controls/StatusLine";
import {Scanlist} from "../../data/navdata/Scanlist";
import {NearestSelector} from "../../controls/selects/NearestSelector";
import {AirportNearestList} from "../../data/navdata/NearestList";
import {ActiveArrow} from "../../controls/displays/ActiveArrow";


type Apt6PageTypes = {
    activeArrow: ActiveArrow,
    activeIdx: TextDisplay,
    apt: AirportSelector
    waypointType: TextDisplay,
    nearestSelector: NearestSelector,

    fuel: TextDisplay,

    createWpt: CreateWaypointMessage,
}


export class Apt6Page extends WaypointPage<AirportFacility> {

    public readonly cursorController;
    readonly children: UIElementChildren<Apt6PageTypes>;

    readonly name: string = "APT 6";

    protected readonly mainRef: NodeReference<HTMLDivElement>;

    constructor(props: PageProps) {
        super(props);


        console.log(this.facility);

        const facility = unpackFacility(this.facility);

        if (this.props.scanLists.aptScanlist.isEmpty()) {
            props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "NO APT WPTS");
        }

        this.children = new UIElementChildren<Apt6PageTypes>({
            activeArrow: new ActiveArrow(facility?.icao ?? null, this.props.memory.navPage),
            activeIdx: new TextDisplay(this.getActiveIdxText()),
            apt: new AirportSelector(this.props.bus, this.ident, this.props.facilityLoader, this.changeFacility.bind(this)),
            waypointType: new TextDisplay(this.activeIdx === -1 ? "" : "A"),
            nearestSelector: new NearestSelector(isNearestWpt(this.facility) ? this.facility.index : -1),
            fuel: new TextDisplay(this.formatFuel(facility)),
            createWpt: new CreateWaypointMessage(() => Apt1Page.createAtUserPosition(props), () => Apt1Page.createAtPresentPosition(props)),
        });

        this.mainRef = FSComponent.createRef<HTMLDivElement>();

        if (this.activeIdx !== -1) {
            this.children.get("apt").setReadonly(true);
        }

        this.cursorController = new CursorController(this.children);

    }


    public render(): VNode {
        return (<pre>
            {this.children.get("activeArrow").render()}{this.children.get("activeIdx").render()}{this.children.get("apt").render()}&nbsp&nbsp{this.children.get("waypointType").render()}{this.children.get("nearestSelector").render()}<br/>
            <div ref={this.mainRef}>
                <br/>
                {this.children.get("fuel").render()}<br/>
                <br/>
                NO OXYGEN<br/>
                NO FEE INFO
            </div>
            {this.children.get("createWpt").render()}
        </pre>);
    }

    public getScanlist(): Scanlist {
        return this.props.scanLists.aptScanlist;
    }

    protected redraw() {
        const facility = unpackFacility(this.facility);
        this.children.get("nearestSelector").setValue(isNearestWpt(this.facility) ? this.facility.index : -1);
        if (facility === null) {
            this.mainRef.instance.classList.add("d-none");
            this.children.get("createWpt").setVisible(true);
        } else {
            this.mainRef.instance.classList.remove("d-none");
            this.children.get("createWpt").setVisible(false);
            this.children.get("fuel").text = this.formatFuel(facility);
        }
    }

    protected changeFacility(fac: string | AirportFacility) {
        super.changeFacility(fac);
        this.children.get("activeArrow").icao = unpackFacility(this.facility)?.icao ?? null;
        this.children.get("apt").setValue(this.ident);
    }


    protected getMemory(): WaypointPageState<AirportFacility> {
        return this.props.memory.aptPage;
    }

    protected getNearestList(): AirportNearestList {
        return this.props.nearestLists.aptNearestList;
    }

    private formatFuel(apt: AirportFacility | null): string {
        return "NO FUEL"; // AirportFacility have a fuel1 and fuel2 field, but they always appear to be empty, even when set with ADE
    }
}