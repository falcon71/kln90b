import {FSComponent, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {SelectField} from "../../controls/selects/SelectField";


type Set6PageTypes = {
    enable: SelectField,
}

/**
 * 4-9
 */
export class Set6Page extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Set6PageTypes>;

    readonly name: string = "SET 6";


    constructor(props: PageProps) {
        super(props);


        const enabled = this.props.userSettings.getSetting("turnAnticipation").get();


        this.children = new UIElementChildren<Set6PageTypes>({
            enable: new SelectField(["DISABLE", " ENABLE"], enabled ? 1 : 0, this.saveEnableTurnanticipation.bind(this)),
        });

        this.cursorController = new CursorController(this.children);
    }

    public render(): VNode {
        return (<pre>
            &nbsp&nbsp&nbspTURN<br/>
            ANTICIPATE<br/>
            <br/>
            &nbsp{this.children.get("enable").render()}
        </pre>);
    }

    private saveEnableTurnanticipation(enabled: number): void {
        this.props.userSettings.getSetting("turnAnticipation").set(enabled === 1);
    }


}