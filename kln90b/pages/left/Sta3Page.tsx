import {FSComponent, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {NO_CHILDREN, PageProps} from "../Page";
import {NO_CURSOR_CONTROLLER} from "../CursorController";
import {VERSION} from "../../Version";


/**
 * 5-31
 */
export class Sta3Page extends SixLineHalfPage {

    public readonly cursorController = NO_CURSOR_CONTROLLER;
    readonly children = NO_CHILDREN;

    readonly name: string = "STA 3";

    constructor(props: PageProps) {
        super(props);
    }

    public render(): VNode {
        //From the installation manual 2.4.1: CAL 0 -10°, CAL 100: 0° (default), CAL 200: +10°
        //can be adjusted by holding the left CRS Button when turning the device on
        return (<pre>
            HOST SW<br/>
            {VERSION.padStart(11, " ")}<br/>
            RCVR SW<br/>
            &nbsp&nbsp&nbsp&nbsp&nbsp&nbsp&nbsp&nbsp&nbsp02<br/>
            <br/>
            OBS CAL&nbsp100
        </pre>);
    }

}