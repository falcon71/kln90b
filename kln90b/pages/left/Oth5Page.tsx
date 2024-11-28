import {FSComponent, NodeReference, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {NO_CHILDREN, PageProps, UIElementChildren} from "../Page";
import {CursorController, EnterResult, Field} from "../CursorController";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {format} from "numerable";
import {KLN90PlaneSettings} from "../../settings/KLN90BPlaneSettings";
import {Sensors} from "../../Sensors";
import {TickController} from "../../TickController";
import {OthFuelDisplay} from "../../controls/displays/FuelDisplay";
import {OthFuelFieldset, TripFuelFieldset} from "../../controls/selects/FuelFieldset";
import {ActiveArrow} from "../../controls/displays/ActiveArrow";
import {IcaoFixedLength} from "../../data/navdata/IcaoFixedLength";


type Oth5PageTypes = {
    destArrow: ActiveArrow,
    dest: TextDisplay,
    fuelUnit: TextDisplay,
    fobLabel: TextDisplay,
    fob: FuelOnBoardSelect,
    reqd: OthFuelDisplay,
    lFob: OthFuelDisplay,
    res: TripFuelFieldset,
    extra: OthFuelDisplay,
}

/**
 * 5-39
 */
export class Oth5Page extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Oth5PageTypes>;

    readonly name: string = "OTH 5";


    constructor(props: PageProps) {
        super(props);

        const destination = this.props.memory.navPage.activeWaypoint.getDestination();

        this.children = new UIElementChildren<Oth5PageTypes>({
            destArrow: new ActiveArrow(destination?.icaoStruct ?? null, this.props.memory.navPage),
            dest: new TextDisplay(IcaoFixedLength.getIdentFromFacility(destination)),
            fuelUnit: new TextDisplay(this.props.planeSettings.input.fuelComputer.unit.padStart(3, " ")),
            fobLabel: new TextDisplay(this.props.planeSettings.input.fuelComputer.fobTransmitted ? " " : ":"),
            fob: new FuelOnBoardSelect(this.props.planeSettings, this.props.sensors),
            reqd: new OthFuelDisplay(null),
            lFob: new OthFuelDisplay(null),
            res: new OthFuelFieldset(this.props.memory.othPage.reserve, this.setReserve.bind(this)),
            extra: new OthFuelDisplay(null),
        });

        this.cursorController = new CursorController(this.children);
    }

    public render(): VNode {
        return (<pre>
            {this.children.get("destArrow").render()}{this.children.get("dest").render()}&nbsp&nbsp{this.children.get("fuelUnit").render()}<br/>
            FOB{this.children.get("fobLabel").render()}&nbsp&nbsp{this.children.get("fob").render()}<br/>
            REQD&nbsp&nbsp{this.children.get("reqd").render()}<br/>
            L FOB {this.children.get("lFob").render()}<br/>
            RES:&nbsp&nbsp{this.children.get("res").render()}<br/>
            EXTRA {this.children.get("extra").render()}
        </pre>);
    }

    public tick(blink: boolean): void {
        this.requiresRedraw = true;
        super.tick(blink);
    }

    protected redraw(): void {

        const futureLegs = this.props.memory.navPage.activeWaypoint.getFutureLegs();
        const destLeg = futureLegs.length > 0 ? futureLegs[futureLegs.length - 1] : null;

        this.children.get("destArrow").icao = destLeg?.wpt?.icaoStruct ?? null;
        this.children.get("dest").text = IcaoFixedLength.getIdentFromFacility(destLeg?.wpt ?? null);


        const fob = this.props.sensors.in.fuelComputer.fob;
        const ff = this.props.sensors.in.fuelComputer.fuelFlow1 + this.props.sensors.in.fuelComputer.fuelFlow2;

        let reqd = null;
        let lfob = null;
        let extra = null;
        if (this.props.memory.navPage.eteToDest !== null) {
            reqd = ff * this.props.memory.navPage.eteToDest / 3600;
            lfob = fob - reqd;
            extra = lfob - this.props.memory.othPage.reserve;
        }

        this.children.get("reqd").fuel = reqd;
        this.children.get("lFob").fuel = lfob;
        this.children.get("extra").fuel = extra;
    }

    private setReserve(reserve: number) {
        this.props.memory.othPage.reserve = reserve;
    }

}

class FuelOnBoardSelect implements Field {


    readonly children = NO_CHILDREN;
    public readonly isEntered: boolean = false;
    public isFocused: boolean = false;
    public isReadonly: boolean = true;

    protected readonly ref: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();


    constructor(planeSettings: KLN90PlaneSettings,
                private readonly sensors: Sensors) {
        this.isReadonly = planeSettings.input.fuelComputer.fobTransmitted;
    }

    public clear(): boolean {
        return false;
    }

    public enter(): Promise<EnterResult> {
        return Promise.resolve(EnterResult.Not_Handled);
    }

    public innerLeft(): boolean {
        this.sensors.in.fuelComputer.fob = Math.max(this.sensors.in.fuelComputer.fob - 1, 0);
        return true;
    }

    public innerRight(): boolean {
        this.sensors.in.fuelComputer.fob = Math.min(this.sensors.in.fuelComputer.fob + 1, 99999);
        return false;
    }

    public isClearAccepted(): boolean {
        return false;
    }

    public isEnterAccepted(): boolean {
        return false;
    }

    public outerLeft(): boolean {
        return false;
    }

    public outerRight(): boolean {
        return false;
    }

    public keyboard(key: string): boolean {
        return false;
    }

    public render(): VNode {
        return (
            <span ref={this.ref}>{this.getDisplayValue()}</span>);
    }

    public setFocused(focused: boolean): void {
        this.isFocused = focused;
    }

    public tick(blink: boolean): void {
        if (!TickController.checkRef(this.ref)) {
            return;
        }

        this.ref.instance.textContent = this.getDisplayValue();

        if (this.isFocused) {
            this.ref!.instance.classList.add("inverted");
        } else {
            this.ref!.instance.classList.remove("inverted");
        }
    }

    private getDisplayValue(): string {
        return format(this.sensors.in.fuelComputer.fob, "0").padStart(5, " ")
    }


}