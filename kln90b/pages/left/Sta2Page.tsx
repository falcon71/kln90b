import {FSComponent, NodeReference, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {UIElementChildren} from "../Page";
import {NO_CURSOR_CONTROLLER} from "../CursorController";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {format} from "numerable";


type Sta2PageTypes = {
    posError: TextDisplay;
}

/**
 * 5-30
 */
export class Sta2Page extends SixLineHalfPage {

    public readonly cursorController = NO_CURSOR_CONTROLLER;
    readonly children: UIElementChildren<Sta2PageTypes> = new UIElementChildren<Sta2PageTypes>({
        posError: new TextDisplay(".--"),
    });

    readonly name: string = "STA 2";

    protected readonly ref: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();


    public render(): VNode {
        return (<pre>
            ESTIMATED<br/>
            POSN ERROR<br/>
            &nbsp&nbsp&nbsp&nbsp&nbsp&nbsp{this.children.get("posError").render()}nm
        </pre>);
    }

    public tick(blink: boolean): void {
        this.requiresRedraw = true;
        super.tick(blink);
    }

    protected redraw(): void {
        if (this.props.sensors.in.gps.isValid()) {
            const posError = this.props.sensors.in.gps.anp * 100;
            this.children.get("posError").text = `.${format(posError, "00")}`;
        } else {
            this.children.get("posError").text = ".--";
        }

    }
}