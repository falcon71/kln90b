import {FSComponent, NodeReference, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {UIElementChildren} from "../Page";
import {NO_CURSOR_CONTROLLER} from "../CursorController";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {padFixed} from "../../data/NumberFormat";


type Sta2PageTypes = {
    posError: TextDisplay;
}

/**
 * The estimated position error as the line shows it: hundredths of a nautical mile in five characters, or five
 * dashes without an estimate, as every null display value.
 */
export function formatEpe(epeNm: number | null): string {
    if (epeNm === null) {
        return "-----";
    }
    return padFixed(epeNm, 1, 2).padStart(5);
}

/**
 * 5-30 describes the page. The third line does not follow the figure of 5-30 (a number of feet or a bare fraction): it
 * follows the photographed real unit on host software 01515-0047 (design spec, section 1), which shows the error in
 * nautical miles with two decimals, e.g. 0.01NM, and five dashes before NM without a fix (the font draws dashes low).
 * The estimate is the unit's own solution (GpsSolution.ts): EPE = 2 * HDOP * 5 m / 1852 m per NM. It is not the SDK's
 * hdop, which is -1 with three satellites plus the altitude.
 */
export class Sta2Page extends SixLineHalfPage {

    public readonly cursorController = NO_CURSOR_CONTROLLER;
    readonly children: UIElementChildren<Sta2PageTypes> = new UIElementChildren<Sta2PageTypes>({
        posError: new TextDisplay(formatEpe(null)),
    });

    readonly name: string = "STA 2";

    protected readonly ref: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();


    public render(): VNode {
        return (<pre>
            ESTIMATED<br/>
            POSN ERROR<br/>
            &nbsp&nbsp&nbsp&nbsp{this.children.get("posError").render()}NM
        </pre>);
    }

    public tick(blink: boolean): void {
        this.requiresRedraw = true;
        super.tick(blink);
    }

    protected redraw(): void {
        const gps = this.props.sensors.in.gps;
        //An invalid solution can still carry a finite estimate (EPE above the limit), so the validity decides
        this.children.get("posError").text = gps.isValid() ? formatEpe(gps.solution.epeNm) : formatEpe(null);

    }
}