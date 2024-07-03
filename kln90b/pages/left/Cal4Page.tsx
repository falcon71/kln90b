import {FSComponent, UnitType, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {Knots} from "../../data/Units";
import {SpeedFieldset} from "../../controls/selects/SpeedFieldset";
import {VnavAngleFieldset} from "../../controls/selects/VnavFieldsets";
import {FpmFieldset} from "../../controls/selects/FpmFieldset";


type Cal4PageTypes = {
    gs: SpeedFieldset,
    fpm: FpmFieldset,
    angle: VnavAngleFieldset,
}

/**
 * 5-12
 */
export class Cal4Page extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Cal4PageTypes>;

    readonly name: string = "CAL 4";

    constructor(props: PageProps) {
        super(props);

        this.children = new UIElementChildren<Cal4PageTypes>({
            gs: new SpeedFieldset(this.props.userSettings.getSetting('cal4GS').get(), this.setGS.bind(this)),
            fpm: new FpmFieldset(this.props.userSettings.getSetting('cal4Fpm').get(), this.setFpm.bind(this)),
            angle: new VnavAngleFieldset(this.props.userSettings.getSetting('cal4Angle').get(), this.setAngle.bind(this)),
        });

        this.cursorController = new CursorController(this.children);
    }


    public render(): VNode {
        return (<pre>
            &nbspVNV ANGLE<br/>
            <br/>
            GS:&nbsp&nbsp&nbsp{this.children.get("gs").render()}kt<br/>
            FPM:&nbsp&nbsp&nbsp{this.children.get("fpm").render()}<br/>
            ANGLE:{this.children.get("angle").render()}°
        </pre>);


    }

    private setGS(gs: Knots): void {
        this.props.userSettings.getSetting('cal4GS').set(gs);
        let angle = 0;
        if (gs > 0) {
            angle = Math.atan(this.props.userSettings.getSetting('cal4Fpm').get() / UnitType.KNOT.convertTo(gs, UnitType.FPM)) * Avionics.Utils.RAD2DEG;
        }
        this.props.userSettings.getSetting('cal4Angle').set(angle);
        this.children.get("angle").setValue(angle);
    }

    private setFpm(fpm: number): void {
        this.props.userSettings.getSetting('cal4Fpm').set(fpm);
        let angle = 0;
        if (this.props.userSettings.getSetting('cal4GS').get() > 0) {
            angle = Math.atan(fpm / UnitType.KNOT.convertTo(this.props.userSettings.getSetting('cal4GS').get(), UnitType.FPM)) * Avionics.Utils.RAD2DEG;
        }
        this.props.userSettings.getSetting('cal4Angle').set(angle);
        this.children.get("angle").setValue(angle);
    }

    private setAngle(angle: number): void {
        this.props.userSettings.getSetting('cal4Angle').set(angle);
        const fpm = Math.round(UnitType.KNOT.convertTo(this.props.userSettings.getSetting('cal4GS').get(), UnitType.FPM) * Math.tan(angle * Avionics.Utils.DEG2RAD) / 100) * 100;

        this.props.userSettings.getSetting('cal4Fpm').set(fpm);
        this.children.get("fpm").setFpm(fpm);

    }

}