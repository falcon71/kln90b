import {FSComponent, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {AltitudeFieldset} from "../../controls/selects/AltitudeFieldset";
import {BaroFieldset, BaroFieldsetFactory} from "../../controls/selects/BaroFieldset";
import {TempFieldset} from "../../controls/selects/TempFieldset";
import {Celsius, Feet, Inhg, Knots} from "../../data/Units";
import {cas2Mach, indicatedAlt2PressureAlt, mach2Tas} from "../../data/Conversions";
import {SpeedFieldset} from "../../controls/selects/SpeedFieldset";
import {SpeedDisplay} from "../../controls/displays/SpeedDisplay";


type Cal2PageTypes = {
    cas: SpeedFieldset,
    indicated: AltitudeFieldset,
    baro: BaroFieldset,
    tat: TempFieldset,
    tas: SpeedDisplay,
}

/**
 * 5-11
 */
export class Cal2Page extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Cal2PageTypes>;

    readonly name: string = "CAL 2";

    constructor(props: PageProps) {
        super(props);

        this.children = new UIElementChildren<Cal2PageTypes>({
            cas: new SpeedFieldset(this.props.memory.calPage.cal2Cas, this.setCas.bind(this)),
            indicated: new AltitudeFieldset(this.props.memory.calPage.cal2IndicatedAltitude, this.setIndicatedAltitude.bind(this)),
            baro: BaroFieldsetFactory.createBaroFieldSet(this.props.memory.calPage.cal2Barometer, this.props.userSettings, this.setBarometer.bind(this)),
            tat: new TempFieldset(this.props.memory.calPage.cal2TAT, this.setTemp.bind(this)),
            tas: new SpeedDisplay(null),
        });
        this.cursorController = new CursorController(this.children);
    }


    public render(): VNode {
        return (<pre>
            &nbsp&nbsp&nbsp&nbspTAS<br/>
            CAS:&nbsp&nbsp{this.children.get("cas").render()}kt<br/>
            ALT:{this.children.get("indicated").render()}ft<br/>
            BARO:{this.children.get("baro").render()}<br/>
            TEMP: {this.children.get("tat").render()}°C<br/>
            TAS&nbsp&nbsp&nbsp{this.children.get("tas").render()}kt
        </pre>);
    }

    protected redraw(): void {
        //we don't set the CAL 3 page, when the page is only viewed and no values are changed
        this.children.get("tas").speed = this.calculateTas();
    }

    private setCas(cas: Knots): void {
        this.props.memory.calPage.cal2Cas = cas;
        const tas = this.calculateTas();
        this.props.memory.calPage.cal3Tas = tas;
        this.children.get("tas").speed = tas;
    }

    private setIndicatedAltitude(alt: Feet): void {
        this.props.memory.calPage.cal2IndicatedAltitude = alt;

        const tas = this.calculateTas();
        this.props.memory.calPage.cal3Tas = tas;
        this.children.get("tas").speed = tas;
    }

    private setBarometer(baro: Inhg): void {
        this.props.memory.calPage.cal2Barometer = baro;

        const tas = this.calculateTas();
        this.props.memory.calPage.cal3Tas = tas;
        this.children.get("tas").speed = tas;
    }

    private setTemp(temp: Celsius): void {
        this.props.memory.calPage.cal2TAT = temp;

        const tas = this.calculateTas();
        this.props.memory.calPage.cal3Tas = tas;
        this.children.get("tas").speed = tas;
    }

    private calculateTas(): Knots {
        const pressureAlt = indicatedAlt2PressureAlt(this.props.memory.calPage.cal2IndicatedAltitude, this.props.memory.calPage.cal2Barometer);
        const mach = cas2Mach(this.props.memory.calPage.cal2Cas, pressureAlt);
        let tas = 0;
        if (!isNaN(mach)) {
            tas = mach2Tas(mach, this.props.memory.calPage.cal2TAT);
        }
        return tas;
    }
}