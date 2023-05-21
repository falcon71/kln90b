import {FSComponent, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {NO_CHILDREN, PageProps} from "../Page";
import {NO_CURSOR_CONTROLLER} from "../CursorController";

/**
 * 5-31
 */
export class Sta4Page extends SixLineHalfPage {

    public readonly cursorController = NO_CURSOR_CONTROLLER;
    readonly children = NO_CHILDREN;

    readonly name: string = "STA 4";

    constructor(props: PageProps) {
        super(props);
    }

    public render(): VNode {
        //This page shows hours, I don't mind making it completely static
        return (<pre>
            TOTAL TIME<br/>
            {Math.floor(this.props.userSettings.getSetting("totalTime").get() / 3600).toString().padStart(8, " ")} HR<br/>
            PWR CYCLES<br/>
            {this.props.userSettings.getSetting("powercycles").get().toString().padStart(8, " ")}<br/>
        </pre>);
    }

}