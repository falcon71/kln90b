import {FSComponent, VNode} from '@microsoft/msfs-sdk';
import {CursorController, NO_CURSOR_CONTROLLER} from "./CursorController";
import {FourSegmentPage, SixLinePage} from "./FourSegmentPage";
import {PageProps, UIElementChildren} from "./Page";
import {Button} from "../controls/Button";
import {AiracPage} from "./AiracPage";
import {ObswarningPage} from "./ObsWarningPage";


type VFROnlyPageChildTypes = {
    ack: Button;
}


export class VFROnlyPage extends SixLinePage {
    public readonly lCursorController = NO_CURSOR_CONTROLLER;
    readonly children = new UIElementChildren<VFROnlyPageChildTypes>({
        ack: new Button("ACKNOWLEDGE?", this.acknowledge.bind(this)),
    });
    public readonly rCursorController = new CursorController(this.children);

    constructor(props: PageProps) {
        super(props);
        this.rCursorController.setCursorActive(true);
    }

    public render(): VNode {
        return (<div>
            <br/>
            <span>   FOR VFR USE ONLY</span><br/>
            <br/>,
            <br/>
            <br/>
            <span>     {this.children.get("ack").render()}</span>
        </div>);
    }


    private acknowledge(): void {
        if (this.props.modeController.isObsModeActive()) {
            this.props.pageManager.setCurrentPage(FourSegmentPage, {
                ...this.props,
                page: new ObswarningPage(this.props),
            });
        } else {
            this.props.pageManager.setCurrentPage(FourSegmentPage, {
                ...this.props,
                page: new AiracPage(this.props),
            });
        }
    }
}