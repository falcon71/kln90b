import {FSComponent, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {SelectField} from "../../controls/selects/SelectField";
import {BARO_UNIT_HPA} from "../../settings/KLN90BUserSettings";


type Set7PageTypes = {
    baroUnit: SelectField;
    baroUnitText: TextDisplay;
}

/**
 * 5-10
 */
export class Set7Page extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Set7PageTypes>;

    readonly name: string = "SET 7";

    constructor(props: PageProps) {
        super(props);


        const baroUnit = this.props.userSettings.getSetting("barounit").get();

        this.children = new UIElementChildren<Set7PageTypes>({
            baroUnit: new SelectField(["\" ", "MB"], baroUnit === BARO_UNIT_HPA ? 1 : 0, this.saveBaroUnit.bind(this)),
            baroUnitText: new TextDisplay(baroUnit === BARO_UNIT_HPA ? "MILLIBARS" : " INCHES"),
        });

        this.cursorController = new CursorController(this.children);
    }

    public render(): VNode {
        return (<pre>
            &nbspBARO SET<br/>
            &nbsp&nbspUNITS<br/>
            <br/>
            &nbsp&nbsp&nbsp&nbsp{this.children.get("baroUnit").render()}<br/>
            <br/>
            &nbsp{this.children.get("baroUnitText").render()}
        </pre>);
    }

    private saveBaroUnit(baroUnit: number): void {
        this.children.get("baroUnitText").text = baroUnit === 0 ? " INCHES" : "MILLIBARS";

        this.props.userSettings.getSetting("barounit").set(baroUnit === 0);
    }


}