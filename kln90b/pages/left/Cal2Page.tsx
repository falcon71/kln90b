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
            cas: new SpeedFieldset(this.props.userSettings.getSetting('cal2Cas').get(), this.setCas.bind(this)),
            indicated: new AltitudeFieldset(this.props.userSettings.getSetting('cal12IndicatedAltitude').get(), this.setIndicatedAltitude.bind(this)),
            baro: BaroFieldsetFactory.createBaroFieldSet(this.props.userSettings.getSetting('cal12Barometer').get(), this.props.userSettings, this.setBarometer.bind(this)),
            tat: new TempFieldset(this.props.userSettings.getSetting('cal2TAT').get(), this.setTemp.bind(this)),
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
        //we do actually want set the CAL 3 page, when the page is only viewed and no values are changed. This is based on the KLN-89 trainer
        const tas = this.calculateTas();
        this.props.userSettings.getSetting('cal3Tas').set(tas);
        this.children.get("tas").speed = tas;
    }

    private setCas(cas: Knots): void {
        this.props.userSettings.getSetting('cal2Cas').set(cas);
        this.requiresRedraw = true;
    }

    private setIndicatedAltitude(alt: Feet): void {
        this.props.userSettings.getSetting('cal12IndicatedAltitude').set(alt);
        this.requiresRedraw = true;
    }

    private setBarometer(baro: Inhg): void {
        this.props.userSettings.getSetting('cal12Barometer').set(baro);
        this.requiresRedraw = true;
    }

    private setTemp(temp: Celsius): void {
        this.props.userSettings.getSetting('cal2TAT').set(temp);
        this.requiresRedraw = true;
    }

    private calculateTas(): Knots {
        const pressureAlt = indicatedAlt2PressureAlt(this.props.userSettings.getSetting('cal12IndicatedAltitude').get(), this.props.userSettings.getSetting('cal12Barometer').get());
        const mach = cas2Mach(this.props.userSettings.getSetting('cal2Cas').get(), pressureAlt);
        let tas = 0;
        if (!isNaN(mach)) {
            tas = mach2Tas(mach, this.props.userSettings.getSetting('cal2TAT').get());
        }
        return tas;
    }
}