import {FSComponent, UnitType, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {Celsius, Knots, Mph} from "../../data/Units";
import {SpeedFieldset} from "../../controls/selects/SpeedFieldset";
import {TempFieldset} from "../../controls/selects/TempFieldset";


type Cal5PageTypes = {
    tempC: TempFieldset,
    tempF: TempFieldset,
    speedKt: SpeedFieldset,
    speedMph: SpeedFieldset,
}

/**
 * 5-13
 */
export class Cal5Page extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Cal5PageTypes>;

    readonly name: string = "CAL 5";

    constructor(props: PageProps) {
        super(props);

        this.children = new UIElementChildren<Cal5PageTypes>({
            tempC: new TempFieldset(this.props.memory.calPage.cal5TempC, this.setTempC.bind(this)),
            tempF: new TempFieldset(this.props.memory.calPage.cal5TempF, this.setTempF.bind(this)),
            speedKt: new SpeedFieldset(this.props.memory.calPage.cal5SpeedKt, this.setSpeedKt.bind(this)),
            speedMph: new SpeedFieldset(this.props.memory.calPage.cal5SpeedMph, this.setSpeedMph.bind(this)),
        });

        this.cursorController = new CursorController(this.children);
    }


    public render(): VNode {
        return (<pre>
            TEMP/SPEED<br/>
            &nbsp&nbsp&nbsp{this.children.get("tempC").render()}°C<br/>
            &nbsp&nbsp&nbsp{this.children.get("tempF").render()}°F<br/>
            <br/>
            &nbsp&nbsp&nbsp{this.children.get("speedKt").render()}kt<br/>
            &nbsp&nbsp&nbsp{this.children.get("speedMph").render()}mph
        </pre>);


    }

    private setTempC(tempC: Celsius): void {
        this.props.memory.calPage.cal5TempC = tempC;
        const tempF = UnitType.CELSIUS.convertTo(tempC, UnitType.FAHRENHEIT);
        this.props.memory.calPage.cal5TempF = tempF;
        this.children.get("tempF").setTemp(tempF);
    }

    private setTempF(tempF: Celsius): void {
        this.props.memory.calPage.cal5TempF = tempF;
        const tempC = UnitType.FAHRENHEIT.convertTo(tempF, UnitType.CELSIUS);
        this.props.memory.calPage.cal5TempC = tempC;
        this.children.get("tempC").setTemp(tempC);
    }

    private setSpeedKt(speedKt: Knots): void {
        this.props.memory.calPage.cal5SpeedKt = speedKt;
        const speedMph = UnitType.KNOT.convertTo(speedKt, UnitType.MPH);
        this.props.memory.calPage.cal5SpeedMph = speedMph;
        this.children.get("speedMph").setSpeed(speedMph);
    }

    private setSpeedMph(speedMph: Mph): void {
        this.props.memory.calPage.cal5SpeedMph = speedMph;
        const speedKt = UnitType.MPH.convertTo(speedMph, UnitType.KNOT);
        this.props.memory.calPage.cal5SpeedKt = speedKt;
        this.children.get("speedKt").setSpeed(speedKt);
    }
}