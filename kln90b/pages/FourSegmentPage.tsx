import {DisplayComponent, FSComponent, VNode} from "@microsoft/msfs-sdk";
import {
    EVT_CLR,
    EVT_ENT,
    EVT_L_CURSOR,
    EVT_L_INNER_LEFT,
    EVT_L_INNER_RIGHT,
    EVT_L_OUTER_LEFT,
    EVT_L_OUTER_RIGHT,
    EVT_R_CURSOR,
    EVT_R_INNER_LEFT,
    EVT_R_INNER_RIGHT,
    EVT_R_OUTER_LEFT,
    EVT_R_OUTER_RIGHT,
} from "../HEvents";
import {StatusLine} from "../controls/StatusLine";
import {CursorController, EnterResult} from "./CursorController";
import {Page, PageProps, UiElement, UIElementChildren} from "./Page";
import {KeyboardService} from "../services/KeyboardService";

export interface FourPageProps extends PageProps {
    page: SixLinePage;
}


export abstract class SixLinePage extends DisplayComponent<PageProps> implements UiElement {
    abstract readonly lCursorController: CursorController;
    abstract readonly rCursorController: CursorController;
    abstract children: UIElementChildren<any>;

    public name: string = "     ";

    enter(): boolean {
        if (this.lCursorController.isEnterAccepted()) {
            this.lCursorController.enter();
            return true;
        } else if (this.rCursorController.isEnterAccepted()) {
            this.rCursorController.enter();
            return true;
        }
        return false;


    }

    msg(): boolean {
        return false;
    }

    tick(blink: boolean): void {
    }


    isEnterAccepted(): boolean {
        return this.lCursorController.isEnterAccepted() || this.rCursorController.isEnterAccepted();
    }

    public scanRight(): boolean {
        return false;
    }

    public scanLeft(): boolean {
        return false;
    }

    clear(): boolean {
        return this.lCursorController.clear() || this.rCursorController.clear();
    }

}

export type FourSegmentPageChildTypes = {
    page: SixLinePage;
    statusLine: StatusLine;
}

export class FourSegmentPage extends DisplayComponent<FourPageProps> implements Page {


    readonly children: UIElementChildren<FourSegmentPageChildTypes> = new UIElementChildren<FourSegmentPageChildTypes>({
        page: this.props.page,
        statusLine: new StatusLine({...this.props, "screen": this}),
    });

    onInteractionEvent(evt: string): boolean {
        KeyboardService.routeKeyboardEvent(evt, this.props.page.lCursorController, this.props.page.rCursorController);

        switch (evt) {
            case EVT_L_CURSOR:
                return this.props.page.lCursorController.toggleCursor();
            case EVT_R_CURSOR:
                return this.props.page.rCursorController.toggleCursor();
            case EVT_L_OUTER_LEFT:
                return this.props.page.lCursorController.outerLeft();
            case EVT_L_OUTER_RIGHT:
                return this.props.page.lCursorController.outerRight();
            case EVT_R_OUTER_LEFT:
                return this.props.page.rCursorController.outerLeft();
            case EVT_R_OUTER_RIGHT:
                return this.props.page.rCursorController.outerRight();
            case EVT_L_INNER_LEFT:
                return this.props.page.lCursorController.innerLeft();
            case EVT_L_INNER_RIGHT:
                return this.props.page.lCursorController.innerRight();
            case EVT_R_INNER_LEFT:
                return this.props.page.rCursorController.innerLeft();
            case EVT_R_INNER_RIGHT:
                return this.props.page.rCursorController.innerRight();
            case EVT_ENT:
                this.handleEnter();
                return true;

            case EVT_CLR:
                return this.props.page.lCursorController.clear() || this.props.page.rCursorController.clear();
        }
        return false;
    }

    render(): VNode {
        return (
            <div class="full-page">
                {this.props.page.render()}
                {this.children.get("statusLine").render()}
            </div>
        );
    }

    isEnterAccepted(): boolean {
        return this.props.page.isEnterAccepted();
    }

    isLeftCursorActive(): boolean {
        return this.props.page.lCursorController.cursorActive;
    }

    isRightCursorActive(): boolean {
        return this.props.page.rCursorController.cursorActive;
    }

    tick(blink: boolean): void {
    }

    leftPageName(): string {
        return "     ";
    }

    rightPageName(): string {
        return "     ";
    }

    public isMessagePageShown(): boolean {
        return false;
    }

    private async handleEnter(): Promise<boolean> {
        if (this.props.page.lCursorController.isEnterAccepted()) { //If right requires confirmation, then it has priority
            return await this.props.page.lCursorController.enter() != EnterResult.Not_Handled;
        } else if (this.props.page.rCursorController.isEnterAccepted()) { //If right requires confirmation, then it has priority
            return await this.props.page.rCursorController.enter() != EnterResult.Not_Handled;
        }

        //Otherwise, we see if left does something
        if (await this.props.page.lCursorController.enter() != EnterResult.Not_Handled) {
            return true;
        }

        //Next right
        if (await this.props.page.rCursorController.enter() != EnterResult.Not_Handled) {
            return true;
        }
        //Lastly the page itself
        return this.props.page.enter();
    }
}
