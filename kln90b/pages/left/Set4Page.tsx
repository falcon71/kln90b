import {FSComponent, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {SelectField} from "../../controls/selects/SelectField";
import {FLT_TIMER_POWER} from "../../settings/KLN90BUserSettings";


type Set4PageTypes = {
    flightTimer: SelectField;
}

/**
 * 4-13
 */
export class Set4Page extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Set4PageTypes>;

    readonly name: string = "SET 4";

    constructor(props: PageProps) {
        super(props);


        const flightTimer = this.props.userSettings.getSetting("flightTimer").get();

        this.children = new UIElementChildren<Set4PageTypes>({
            flightTimer: new SelectField(["GS > 30kt  ", "POWER IS ON"], flightTimer === FLT_TIMER_POWER ? 1 : 0, this.saveFlightTimer.bind(this)),
        });

        this.cursorController = new CursorController(this.children);
    }

    public render(): VNode {
        return (<pre>
            &nbsp&nbspFLIGHT<br/>
            &nbsp&nbspTIMER<br/>
            &nbspOPERATION<br/>
            <br/>
            RUN WHEN<br/>
            {this.children.get("flightTimer").render()}
        </pre>);
    }

    private saveFlightTimer(flightTimer: number): void {
        this.props.userSettings.getSetting("flightTimer").set(flightTimer === 1);
    }


}