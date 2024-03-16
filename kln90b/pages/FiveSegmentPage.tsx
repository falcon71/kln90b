import {DisplayComponent, FSComponent, NodeReference, VNode} from "@microsoft/msfs-sdk";
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
    EVT_R_SCAN_LEFT,
    EVT_R_SCAN_RIGHT,
} from "../HEvents";
import {StatusLine} from "../controls/StatusLine";
import {CursorController, EnterResult} from "./CursorController";
import {Page, PageProps, UiElement, UIElementChildren} from "./Page";
import {KeyboardService} from "../services/KeyboardService";

export interface FivePageProps extends PageProps {
    lPage: SixLineHalfPage;
    rPage: SixLineHalfPage;
}


export abstract class SixLineHalfPage extends DisplayComponent<PageProps> implements UiElement {
    abstract readonly name: string;
    abstract children: UIElementChildren<any>;
    numPages = 1;
    currentPage = 0;
    protected abstract readonly cursorController: CursorController;
    protected requiresRedraw: boolean = true;

    abstract render(): VNode

    tick(blink: boolean): void {
        if (this.requiresRedraw) {
            this.redraw();
            this.requiresRedraw = false;
        }
    }

    isEnterAccepted(): boolean {
        return this.getCursorController().isEnterAccepted();
    }

    enter(): Promise<EnterResult> {
        return this.getCursorController().enter();
    }

    clear(): boolean {
        return this.getCursorController().clear();
    }

    public setCurrentPage(page: number): void {
        this.currentPage = Utils.Clamp(page, 0, this.numPages - 1);
        this.requiresRedraw = true;
    }

    public scanRight(): boolean {
        return false;
    }

    public scanLeft(): boolean {
        return false;
    }

    public getCursorController(): CursorController {
        return this.cursorController;
    }

    /**
     * The KLN is an old device, that refreshes only slowly. We only allow changing the dom inside the redraw method,
     * in order to appear as laggy as the real device
     * @protected
     */
    protected redraw() {
    }

}

export type FiveSegmentPageChildTypes = {
    lPage: SixLineHalfPage;
    rPage: SixLineHalfPage;
    statusLine: StatusLine;
}


export class FiveSegmentPage extends DisplayComponent<FivePageProps> implements Page {

    children: UIElementChildren<FiveSegmentPageChildTypes> = new UIElementChildren<FiveSegmentPageChildTypes>({
        lPage: this.props.lPage,
        rPage: this.props.rPage,
        statusLine: new StatusLine({...this.props, "screen": this}),
    });

    protected readonly leftRef: NodeReference<HTMLDivElement>;
    protected readonly rightRef: NodeReference<HTMLDivElement>;

    protected rerenderLeftPage = false;
    protected rerenderRightPage = false;

    constructor(props: FivePageProps) {
        super(props);
        this.leftRef = FSComponent.createRef<HTMLDivElement>();
        this.rightRef = FSComponent.createRef<HTMLDivElement>();
    }

    leftPageName(): string {
        return this.props.lPage.name;
    }

    rightPageName(): string {
        return this.props.rPage.name;
    }

    onInteractionEvent(evt: string): boolean {
        KeyboardService.routeKeyboardEvent(evt, this.props.lPage.getCursorController(), this.props.rPage.getCursorController());

        switch (evt) {
            case EVT_L_CURSOR:
                return this.props.lPage.getCursorController().toggleCursor();
            case EVT_R_CURSOR:
                return this.props.rPage.getCursorController().toggleCursor();
            case EVT_L_OUTER_LEFT:
                return this.props.lPage.getCursorController().outerLeft();
            case EVT_L_OUTER_RIGHT:
                return this.props.lPage.getCursorController().outerRight();
            case EVT_R_OUTER_LEFT:
                return this.props.rPage.getCursorController().outerLeft();
            case EVT_R_OUTER_RIGHT:
                return this.props.rPage.getCursorController().outerRight();
            case EVT_L_INNER_LEFT:
                return this.props.lPage.getCursorController().innerLeft();
            case EVT_L_INNER_RIGHT:
                return this.props.lPage.getCursorController().innerRight();
            case EVT_R_INNER_LEFT:
                return this.props.rPage.getCursorController().innerLeft();
            case EVT_R_INNER_RIGHT:
                return this.props.rPage.getCursorController().innerRight();
            case EVT_R_SCAN_LEFT:
                return this.props.rPage.scanLeft();
            case EVT_R_SCAN_RIGHT:
                return this.props.rPage.scanRight();
            case EVT_ENT:
                this.handleEnter();
                return true;
            case EVT_CLR:
                return this.props.lPage.clear() || this.props.rPage.clear();
        }
        return false;
    }

    render(): VNode {
        return (
            <div>
                <div ref={this.leftRef} class="left-page">
                    {this.props.lPage.render()}
                </div>
                <div ref={this.rightRef} class="right-page">
                    {this.props.rPage.render()}
                </div>
                {this.children.get("statusLine").render()}
            </div>

        );
    }

    isEnterAccepted(): boolean {
        return this.props.lPage.isEnterAccepted() || this.props.rPage.isEnterAccepted();
    }

    isLeftCursorActive(): boolean {
        return this.props.lPage.getCursorController().cursorActive;
    }

    isRightCursorActive(): boolean {
        return this.props.rPage.getCursorController().cursorActive;
    }

    tick(blink: boolean): void {
        if (this.rerenderLeftPage) {
            this.leftRef.instance.innerHTML = "";
            FSComponent.render(this.props.lPage.render(), this.leftRef.instance);
            this.rerenderLeftPage = false;
        }
        if (this.rerenderRightPage) {
            this.rightRef.instance.innerHTML = "";
            FSComponent.render(this.props.rPage.render(), this.rightRef.instance);
            this.rerenderRightPage = false;
        }
    }


    public destroy(): void {
        this.children.get("lPage").destroy();
        this.children.get("rPage").destroy();
        this.children.get("statusLine").destroy();
        super.destroy();
    }

    public isMessagePageShown(): boolean {
        return false;
    }

    private async handleEnter(): Promise<boolean> {
        if (this.props.lPage.isEnterAccepted()) { //If right requires confirmation, then it has priority
            return await this.props.lPage.enter() != EnterResult.Not_Handled;
        } else if (this.props.rPage.isEnterAccepted()) { //If right requires confirmation, then it has priority
            return await this.props.rPage.enter() != EnterResult.Not_Handled;
        }


        //Otherwise, we see if left does something
        if (await this.props.lPage.enter() != EnterResult.Not_Handled) {
            return true;
        }


        //Next right
        return await this.props.rPage.enter() != EnterResult.Not_Handled;
    }
}
