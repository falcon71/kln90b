import {FSComponent, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {SelectField} from "../../controls/selects/SelectField";
import {Button} from "../../controls/Button";
import type {MainPage} from "../MainPage";


/**
 * Every fictitious setting the real KLN does not have
 */


type Set10PageTypes = {
    fastGps: SelectField;
    failures: Button;
}

export class Set10Page extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Set10PageTypes>;

    readonly name: string = "SET10";

    constructor(props: PageProps, setPage: (page: SixLineHalfPage) => void) {
        super(props);

        const fastGpsAcquisition = this.props.userSettings.getSetting("fastGpsAcquisition").get();

        this.children = new UIElementChildren<Set10PageTypes>({
            fastGps: new SelectField(['REAL', 'FAST'], fastGpsAcquisition ? 1 : 0, this.saveFastGpsAcquisition.bind(this)),
            failures: new Button("FAILURES", () => this.openFailures()), //#458: the FLR pages
        });

        this.cursorController = new CursorController(this.children);
    }

    public render(): VNode {
        return (<pre>
                GPS:&nbsp&nbsp&nbsp{this.children.get("fastGps").render()}<br/>
                {this.children.get("failures").render()}<br/>
            </pre>);
    }

    private openFailures(): void {
        this.cursorController.setCursorActive(false); //The outer knob must turn the pages again once the FLR pages are closed
        (this.props.pageManager.getCurrentPage() as MainPage).openFailurePages();
    }

    private saveFastGpsAcquisition(fastGpsAcquisition: number): void {
        this.props.userSettings.getSetting("fastGpsAcquisition").set(fastGpsAcquisition === 1);
        if (fastGpsAcquisition === 1) {
            this.props.sensors.in.gps.startFast(); //#468: REAL only saves the setting; the next power-on runs as REAL
        }
    }

}
