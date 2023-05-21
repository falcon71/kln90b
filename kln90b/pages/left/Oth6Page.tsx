import {FSComponent, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {format} from "numerable";
import {OthFuelFieldset, TripFuelFieldset} from "../../controls/selects/FuelFieldset";
import {DurationDisplay} from "../../controls/displays/DurationDisplay";
import {DistanceDisplay} from "../../controls/displays/DistanceDisplay";
import {HOURS_TO_SECONDS} from "../../data/navdata/NavCalculator";


type Oth6PageTypes = {
    endurance: DurationDisplay,
    range: DistanceDisplay,
    fuelUnit: TextDisplay,
    efficiency: TextDisplay,
    res: TripFuelFieldset,
}

/**
 * 5-41
 */
export class Oth6Page extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Oth6PageTypes>;

    readonly name: string = "OTH 6";


    constructor(props: PageProps) {
        super(props);

        this.children = new UIElementChildren<Oth6PageTypes>({
            endurance: new DurationDisplay(null),
            range: new DistanceDisplay(4, null),
            fuelUnit: new TextDisplay(this.props.planeSettings.input.fuelComputer.unit.padEnd(3, " ")),
            efficiency: new TextDisplay("-.-"),
            res: new OthFuelFieldset(this.props.memory.othPage.reserve, this.setReserve.bind(this)),
        });

        this.cursorController = new CursorController(this.children);
    }

    public render(): VNode {
        return (<pre>
            &nbspFUEL DATA<br/>
            <br/>
            &nbspENDUR{this.children.get("endurance").render()}<br/>
            &nbspRANGE {this.children.get("range").render()}<br/>
            &nbspNM/{this.children.get("fuelUnit").render()} {this.children.get("efficiency").render()}<br/>
            &nbspRES: {this.children.get("res").render()}
        </pre>);
    }

    public tick(blink: boolean): void {
        this.requiresRedraw = true;
        super.tick(blink);
    }

    protected redraw(): void {
        const fob = this.props.sensors.in.fuelComputer.fob;
        const ff = this.props.sensors.in.fuelComputer.fuelFlow1 + this.props.sensors.in.fuelComputer.fuelFlow2;

        let endurance = null;
        let range = null;
        let efficiencyString = "---";
        if (ff > 0) {
            endurance = (fob - this.props.memory.othPage.reserve) / ff * HOURS_TO_SECONDS;
            if (endurance < 0) {
                endurance = null;
            } else {
                range = endurance * this.props.sensors.in.gps.groundspeed / 3600;
            }
            const efficiency = this.props.sensors.in.gps.groundspeed / ff;
            if (efficiency >= 10) {
                efficiencyString = format(Math.min(efficiency, 999), "000");
            } else {
                efficiencyString = format(efficiency, "0.0");
            }
        }

        this.children.get("endurance").time = endurance;
        this.children.get("range").distance = range;
        this.children.get("efficiency").text = efficiencyString;
    }

    private setReserve(reserve: number) {
        this.props.memory.othPage.reserve = reserve;
    }
}