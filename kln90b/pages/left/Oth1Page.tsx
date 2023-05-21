import {FSComponent, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {NO_CHILDREN, PageProps} from "../Page";
import {NO_CURSOR_CONTROLLER} from "../CursorController";


/**
 * 3-52
 * TODO: I don't think MSFS has any FSS in it's DB.
 * The empty page can be seen here: https://www.youtube.com/shorts/9We5fcd2-VE
 */
export class Oth1Page extends SixLineHalfPage {

    public readonly cursorController = NO_CURSOR_CONTROLLER;
    readonly children = NO_CHILDREN;

    readonly name: string = "OTH 1";

    constructor(props: PageProps) {
        super(props);
    }

    public render(): VNode {
        return (<pre>
            NO NEAREST<br/>
            FSS
        </pre>);
    }

}