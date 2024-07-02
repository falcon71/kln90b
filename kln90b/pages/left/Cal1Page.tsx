import {FSComponent, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {AltitudeFieldset} from "../../controls/selects/AltitudeFieldset";
import {BaroFieldset, BaroFieldsetFactory} from "../../controls/selects/BaroFieldset";
import {TempFieldset} from "../../controls/selects/TempFieldset";
import {AltitudeDisplay} from "../../controls/displays/AltitudeDisplay";
import {Celsius, Feet, Inhg} from "../../data/Units";
import {indicatedAlt2PressureAlt, pressureAlt2DensityAlt} from "../../data/Conversions";


type Cal1PageTypes = {
    indicated: AltitudeFieldset,
    baro: BaroFieldset,
    pressure: AltitudeDisplay,
    sat: TempFieldset,
    density: AltitudeDisplay,
}

/**
 * 5-10
 */
export class Cal1Page extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Cal1PageTypes>;

    readonly name: string = "CAL 1";

    constructor(props: PageProps) {
        super(props);

        this.children = new UIElementChildren<Cal1PageTypes>({
            indicated: new AltitudeFieldset(this.props.memory.calPage.cal12IndicatedAltitude, this.setIndicatedAltitude.bind(this)),
            baro: BaroFieldsetFactory.createBaroFieldSet(this.props.memory.calPage.cal12Barometer, this.props.userSettings, this.setBarometer.bind(this)),
            pressure: new AltitudeDisplay(null),
            sat: new TempFieldset(this.props.memory.calPage.cal1SAT, this.setTemp.bind(this)),
            density: new AltitudeDisplay(null),
        });
        this.cursorController = new CursorController(this.children);
    }


    public render(): VNode {
        return (<pre>
            &nbsp&nbspALTITUDE<br/>
            IND:{this.children.get("indicated").render()}ft<br/>
            BARO:{this.children.get("baro").render()}<br/>
            PRS&nbsp{this.children.get("pressure").render()}ft<br/>
            TEMP: {this.children.get("sat").render()}°C<br/>
            DEN&nbsp{this.children.get("density").render()}ft
        </pre>);
    }

    protected redraw() {
        const pressureAlt = indicatedAlt2PressureAlt(this.props.memory.calPage.cal12IndicatedAltitude, this.props.memory.calPage.cal12Barometer);
        this.children.get("pressure").altitude = pressureAlt;
        this.children.get("density").altitude = pressureAlt2DensityAlt(pressureAlt, this.props.memory.calPage.cal1SAT);

    }

    private setIndicatedAltitude(alt: Feet): void {
        this.props.memory.calPage.cal12IndicatedAltitude = alt;
        this.requiresRedraw = true;
    }

    private setBarometer(baro: Inhg): void {
        this.props.memory.calPage.cal12Barometer = baro;
        this.requiresRedraw = true;
    }

    private setTemp(temp: Celsius): void {
        this.props.memory.calPage.cal1SAT = temp;
        this.requiresRedraw = true;
    }
}