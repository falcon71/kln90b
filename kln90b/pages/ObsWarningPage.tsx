import {FSComponent, VNode} from '@microsoft/msfs-sdk';
import {NO_CURSOR_CONTROLLER} from "./CursorController";
import {FourSegmentPage, SixLinePage} from "./FourSegmentPage";
import {NO_CHILDREN, PageProps} from "./Page";
import {AiracPage} from "./AiracPage";


export class ObswarningPage extends SixLinePage {

    readonly children = NO_CHILDREN;
    public readonly lCursorController = NO_CURSOR_CONTROLLER;
    public readonly rCursorController = NO_CURSOR_CONTROLLER;

    constructor(props: PageProps) {
        super(props);
    }

    public render(): VNode {
        return (<pre>
            <br/>
            &nbsp&nbsp&nbsp&nbsp&nbsp&nbsp&nbsp&nbspWARNING<br/>
            <br/>
            &nbspSYSTEM IS IN OBS MODE<br/>
            &nbspPRESS GPS CRS BUTTON<br/>
            &nbspTO CHANGE TO LEG MODE
        </pre>);
    }

    tick(blink: boolean) {
        super.tick(blink);
        if (!this.props.modeController.isObsModeActive()) {
            this.props.pageManager.setCurrentPage(FourSegmentPage, {
                ...this.props,
                page: new AiracPage(this.props),
            });
        }
    }

}