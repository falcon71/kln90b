import {FSComponent, GPSSatellite, GPSSatelliteState, NodeReference, VNode} from '@microsoft/msfs-sdk';
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


    private filterSat(sat: GPSSatellite): boolean{
        return (sat.state.get() == GPSSatelliteState.InUse || sat.state.get() == GPSSatelliteState.InUseDiffApplied) && sat.sbasGroup === undefined;
    }

    protected redraw(): void {


        if (this.props.sensors.in.gps.isValid()) {
            const inUse = this.props.sensors.in.gps.gpsSatComputer.sats.filter(this.filterSat).length;
            let posError: number;
            //hdop is not an absolute value. Let's cheat like the GNSS
            if (inUse >= 6) {
                posError = 3;
            } else if (inUse === 5) {
                posError = 5;
            } else if (inUse === 4) {
                posError = 8;
            } else {
                posError = 99;
            }
            this.children.get("posError").text = `.${format(posError, "00")}`;
        } else {
            this.children.get("posError").text = ".--";
        }

    }
}