import {FSComponent, VNode} from '@microsoft/msfs-sdk';
import {CursorController, NO_CURSOR_CONTROLLER} from "./CursorController";
import {SixLinePage} from "./FourSegmentPage";
import {PageProps, UIElementChildren} from "./Page";
import {Button} from "../controls/Button";


type AiracPageChildTypes = {
    ack: Button;
}


export class AiracPage extends SixLinePage {
    public readonly lCursorController = NO_CURSOR_CONTROLLER;
    readonly children = new UIElementChildren<AiracPageChildTypes>({
        ack: new Button("ACKNOWLEDGE?", this.acknowledge.bind(this)),
    });
    public readonly rCursorController = new CursorController(this.children);

    constructor(props: PageProps) {
        super(props);
        this.rCursorController.setCursorActive(true);
    }

    public render(): VNode {
        return this.props.database.isAiracCurrent() ?
            (<pre>
            &nbsp&nbsp&nbsp&nbsp&nbspINTERNATIONAL<br/>
            &nbsp&nbsp&nbspDATA BASE EXPIRES<br/>
            &nbsp&nbsp&nbsp&nbsp&nbsp&nbsp&nbsp{this.props.database.expirationDateString}<br/>
            <br/>
            <br/>
            &nbsp&nbsp&nbsp&nbsp&nbsp&nbsp{this.children.get("ack").render()}
        </pre>) :
            (<pre>
            &nbsp&nbsp&nbsp&nbsp&nbspINTERNATIONAL<br/>
            &nbsp&nbsp&nbspDATA BASE EXPIRED<br/>
            &nbsp&nbsp&nbsp&nbsp&nbsp&nbsp&nbsp{this.props.database.expirationDateString}<br/>
            &nbsp&nbsp&nbspALL DATA MUST BE<br/>
            &nbspCONFIRMED BEFORE USE<br/>
            &nbsp&nbsp&nbsp&nbsp&nbsp{this.children.get("ack").render()}
        </pre>);
    }


    private acknowledge(): void {
        this.props.pageManager.startMainPage(this.props);
    }

}