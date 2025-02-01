import {AirportFacility, FSComponent, NodeReference, VNode} from '@microsoft/msfs-sdk';
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {FreetextEditor} from "../../controls/editors/FreetextEditor";
import {AirportSelector} from "../../controls/selects/AirportSelector";
import {unpackFacility, WaypointPage} from "./WaypointPage";
import {WaypointPageState} from "../../data/VolatileMemory";
import {CreateWaypointMessage} from "../../controls/selects/CreateWaypointMessage";
import {Apt1Page} from "./Apt1Page";
import {StatusLineMessageEvents} from "../../controls/StatusLine";
import {Scanlist} from "../../data/navdata/Scanlist";
import {NearestSelector} from "../../controls/selects/NearestSelector";
import {AirportNearestList} from "../../data/navdata/NearestList";
import {ActiveArrow} from "../../controls/displays/ActiveArrow";
import {TextDisplay} from "../../controls/displays/TextDisplay";


type Apt5PageTypes = {
    activeArrow: ActiveArrow,
    activeIdx: TextDisplay,
    apt: AirportSelector
    waypointType: TextDisplay,
    nearestSelector: NearestSelector,
    rmk0: FreetextEditor;
    rmk1: FreetextEditor;
    rmk2: FreetextEditor;

    createWpt: CreateWaypointMessage,
}

export class Apt5Page extends WaypointPage<AirportFacility> {

    public readonly cursorController;
    readonly children: UIElementChildren<Apt5PageTypes>;

    readonly name: string = "APT 5";
    protected readonly mainRef: NodeReference<HTMLDivElement>;
    private remarks: [string, string, string];

    constructor(props: PageProps) {
        super(props);


        const facility = unpackFacility(this.facility);

        if (this.props.scanLists.aptScanlist.isEmpty()) {
            props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "NO APT WPTS");
        }

        this.remarks = this.props.remarksManager.getRemarks(this.ident);

        this.children = new UIElementChildren<Apt5PageTypes>({
            activeArrow: new ActiveArrow(facility?.icaoStruct ?? null, this.props.memory.navPage),
            activeIdx: new TextDisplay(this.getActiveIdxText()),
            apt: new AirportSelector(this.props.bus, this.ident, this.props.facilityLoader, this.changeFacility.bind(this)),
            waypointType: new TextDisplay(this.activeIdx === -1 ? "" : "A"),
            nearestSelector: new NearestSelector(this.facility),
            rmk0: new FreetextEditor(this.props.bus, this.remarks[0], 11, rmk => this.saveRmk.bind(this)(rmk, 0)),
            rmk1: new FreetextEditor(this.props.bus, this.remarks[1], 11, rmk => this.saveRmk.bind(this)(rmk, 1)),
            rmk2: new FreetextEditor(this.props.bus, this.remarks[2], 11, rmk => this.saveRmk.bind(this)(rmk, 2)),
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
                REMARKS:<br/>
                {this.children.get("rmk0").render()}<br/>
                {this.children.get("rmk1").render()}<br/>
                {this.children.get("rmk2").render()}<br/>
            </div>
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
            this.mainRef.instance.classList.add("d-none");
            this.children.get("createWpt").setVisible(true);


            this.children.get("rmk0").isReadonly = true;
            this.children.get("rmk1").isReadonly = true;
            this.children.get("rmk2").isReadonly = true;
        } else {
            this.mainRef.instance.classList.remove("d-none");
            this.children.get("createWpt").setVisible(false);
            this.remarks = this.props.remarksManager.getRemarks(facility.icaoStruct.ident);
            this.children.get("rmk0").setValue(this.remarks[0]);
            this.children.get("rmk1").setValue(this.remarks[1]);
            this.children.get("rmk2").setValue(this.remarks[2]);


            this.children.get("rmk0").isReadonly = false;
            this.children.get("rmk1").isReadonly = false;
            this.children.get("rmk2").isReadonly = false;
        }
    }

    protected changeFacility(fac: string | AirportFacility) {
        super.changeFacility(fac);
        this.children.get("activeArrow").icao = unpackFacility(this.facility)?.icaoStruct ?? null;
        this.children.get("apt").setValue(this.ident);
    }

    protected getMemory(): WaypointPageState<AirportFacility> {
        return this.props.memory.aptPage;
    }

    protected getNearestList(): AirportNearestList {
        return this.props.nearestLists.aptNearestList;
    }

    private saveRmk(rmk: string, idx: number): void {
        this.remarks[idx] = rmk;
        try {
            this.props.remarksManager.saveRemarks(this.ident, this.remarks);
        } catch (e) {
            this.props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "RMKS FULL");
        }
    }
}