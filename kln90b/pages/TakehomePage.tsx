import {FSComponent, VNode} from '@microsoft/msfs-sdk';
import {NO_CURSOR_CONTROLLER} from "./CursorController";
import {SixLinePage} from "./FourSegmentPage";
import {PageProps, UIElementChildren} from "./Page";
import {Blink} from "../controls/Blink";
import {FiveSegmentPage} from "./FiveSegmentPage";
import {SelfTestLeftPage} from "./left/SelfTestLeftPage";
import {SelfTestRightPage} from "./right/SelfTestRightPage";


type TakehomePageChildTypes = {
    ack: Blink;
}


export class TakehomePage extends SixLinePage {
    public readonly lCursorController = NO_CURSOR_CONTROLLER;
    public readonly rCursorController = NO_CURSOR_CONTROLLER;
    readonly children = new UIElementChildren<TakehomePageChildTypes>(
        {
            ack: new Blink("ACKNOWLEDGE?"),
        },
    );

    constructor(props: PageProps) {
        super(props);
    }

    public render(): VNode {
        return (<div>
            &nbsp&nbsp&nbsp&nbsp&nbsp&nbsp&nbspWARNING:<br/>
            &nbsp&nbspSYSTEM IS IN TAKE-<br/>
            &nbsp&nbspHOME MODE:&nbsp&nbspDO NOT<br/>
            &nbsp&nbspUSE FOR NAVIGATION<br/>
            <br/>
            &nbsp&nbsp&nbsp&nbsp&nbsp{this.children.get("ack").render()}
        </div>);
    }


    enter(): boolean {
        this.props.pageManager.setCurrentPage(FiveSegmentPage, {
            ...this.props,
            lPage: new SelfTestLeftPage(this.props),
            rPage: new SelfTestRightPage(this.props),
        });
        return true;
    }


    isEnterAccepted(): boolean {
        return true;
    }
}