import {FSComponent, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {Button} from "../../controls/Button";
import {TextDisplay} from "../../controls/displays/TextDisplay";

type MakeRoomPageTypes = {
    wpt: TextDisplay,
    continue: Button,
}

/**
 * #222, #380: the question before waypoints are deleted from the front of FPL 0 to make room. The text follows the
 * AVsoftech 90B trainer (characterization). The KLN 89 asks one such question per waypoint for an FPL insert, on its
 * own screen (checked in its trainer, 2026-10-15); a procedure load that needs room was not seen there. The cursor is
 * on CONTINUE?, which flashes as every focused button does. Each context has its own subclass (maintainer).
 */
export abstract class MakeRoomPage extends SixLineHalfPage {
    public readonly cursorController: CursorController;
    readonly children: UIElementChildren<MakeRoomPageTypes>;
    readonly name: string = "     ";

    protected constructor(props: PageProps, waypointNumber: number) {
        super(props);
        this.children = new UIElementChildren<MakeRoomPageTypes>({
            wpt: new TextDisplay(this.formatWpt(waypointNumber)),
            continue: new Button("CONTINUE?", () => this.onContinue()),
        });
        this.cursorController = new CursorController(this.children);
        this.cursorController.setCursorActive(true);
    }

    /**
     * The question is an open entry (#222, #380): it takes CLR before the right page, which holds an open entry itself
     * while APT 7 or APT 8 is on a selection step (#383), so CLR cancels the question instead of stepping the load back
     */
    public hasOpenEntry(): boolean {
        return true;
    }

    public render(): VNode {
        return (<pre>
            DELETING<br/>
            {this.children.get("wpt").render()}<br/>
            TO MAKE<br/>
            ROOM IN<br/>
            FLIGHTPLAN-<br/>
            {this.children.get("continue").render()}
        </pre>);
    }

    public clear(): boolean {
        this.onCancel();
        return true;
    }

    protected setWaypointNumber(n: number): void {
        this.children.get("wpt").text = this.formatWpt(n);
    }

    private formatWpt(n: number): string {
        return `WPT ${n.toString().padStart(3, " ")}`;
    }

    protected abstract onContinue(): void;

    protected abstract onCancel(): void;
}
