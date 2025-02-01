import {FSComponent, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {SelectField} from "../../controls/selects/SelectField";
import {Button} from "../../controls/Button";


/**
 * Every fictitious setting the real KLN does not have
 */


type Set10PageTypes = {
    fastGps: SelectField;
    enableGlow: SelectField;
    importFlightplan: Button;
}

export class Set10Page extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Set10PageTypes>;

    readonly name: string = "SET10";

    constructor(props: PageProps, setPage: (page: SixLineHalfPage) => void) {
        super(props);

        const fastGpsAcquisition = this.props.userSettings.getSetting("fastGpsAcquisition").get();
        const glow = this.props.userSettings.getSetting("enableGlow").get();

        this.children = new UIElementChildren<Set10PageTypes>({
            fastGps: new SelectField(['REAL', 'FAST'], fastGpsAcquisition ? 1 : 0, this.saveFastGpsAcquisition.bind(this)),
            enableGlow: new SelectField(['OFF', ' ON'], glow ? 1 : 0, this.saveGlow.bind(this)),
        });

        this.cursorController = new CursorController(this.children);
    }

    public render(): VNode {
        return (<pre>
                GPS:&nbsp&nbsp&nbsp{this.children.get("fastGps").render()}<br/>
                GLOW:&nbsp&nbsp&nbsp{this.children.get("enableGlow").render()}<br/>
            {this.children.get("importFlightplan").render()}
            </pre>);
    }

    private saveFastGpsAcquisition(fastGpsAcquisition: number): void {
        this.props.userSettings.getSetting("fastGpsAcquisition").set(fastGpsAcquisition === 1);
        if (fastGpsAcquisition === 1) {
            this.props.sensors.in.gps.gpsSatComputer.acquireAndUseSatellites();
        }
    }

    private saveGlow(glowEnabled: number): void {
        this.props.userSettings.getSetting("enableGlow").set(glowEnabled === 1);
    }

}
