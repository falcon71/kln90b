import {DisplayComponent, FSComponent, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {
    EVT_ALT,
    EVT_APPR_ARM,
    EVT_CLR,
    EVT_DCT,
    EVT_ENT,
    EVT_L_CURSOR,
    EVT_L_INNER_LEFT,
    EVT_L_INNER_RIGHT,
    EVT_L_OUTER_LEFT,
    EVT_L_OUTER_RIGHT,
    EVT_MSG,
    EVT_R_CURSOR,
    EVT_R_INNER_LEFT,
    EVT_R_INNER_RIGHT,
    EVT_R_OUTER_LEFT,
    EVT_R_OUTER_RIGHT,
    EVT_R_SCAN,
    EVT_R_SCAN_LEFT,
    EVT_R_SCAN_RIGHT,
} from "../HEvents";
import {FivePageProps, SixLineHalfPage} from "./FiveSegmentPage";
import {NO_CHILDREN, Page, PageSide} from "./Page";
import {StatusLine} from "../controls/StatusLine";
import {reportErrors} from "../controls/ErrorPage";
import {EnterResult} from "./CursorController";
import {MessagePage} from "../controls/MessagePage";
import {DirectToPage} from "./left/DirectToPage";
import {Nav1Page} from "./left/Nav1Page";
import {SixLinePage} from "./FourSegmentPage";
import {SuperNav1Page} from "./left/SuperNav1Page";
import {AltPage} from "./left/AltPage";
import {Nav5Page} from "./left/Nav5Page";
import {SuperNav5Page} from "./left/SuperNav5Page";
import {SevenLinePage} from "./OneSegmentPage";
import {isCustomPageTreeController, LEFT_PAGE_TREE, PageTreeController, RIGHT_PAGE_TREE} from "./PageTreeController";
import {Nav4RightPage} from "./left/Nav4Page";
import {Set0DummyPage, Set0Page} from "./left/Set0Page";
import {KeyboardService} from "../services/KeyboardService";


class PageStack {

    private stack: { page: SixLineHalfPage, parent: SixLineHalfPage | null }[] = [];

    public push(page: SixLineHalfPage, parent: SixLineHalfPage | null): void {
        this.stack.push({page, parent});
    }

    public pop(): SixLineHalfPage {
        if (this.isBasePageShown()) {
            throw new Error("Cannot pop the base page");
        }
        const page = this.stack.pop()!.page;
        page.destroy(); //#96
        return page;
    }

    public setCurrentPage(page: SixLineHalfPage): void {
        this.stack[this.stack.length - 1].page.destroy(); //#96: every caller passes a new page
        this.stack[this.stack.length - 1] = {page, parent: null};
    }

    public getCurrentPage(): SixLineHalfPage {
        return this.stack[this.stack.length - 1].page;
    }

    /**
     * Returns wether a normale cursor selected base page is shown.
     * False, if an overlay, like DCT, ALT, Duplicalte WPT, ... ist shown
     */
    public isBasePageShown(): boolean {
        return this.stack.length === 1;
    }

    /**
     * True if the page is in this stack, shown or covered by a page pushed on top of it
     */
    public contains(page: SixLineHalfPage): boolean {
        return this.stack.some(p => p.page === page);
    }

    /**
     * Should be called whenever a page is removed. This checks, if it is a parent page and removes those children
     * as well. Returns true, if children have been removed;
     * @param parent
     */
    public parentRemoved(parent: SixLineHalfPage): boolean {
        const lengthBefore = this.stack.length;
        this.stack.filter(p => p.parent === parent).forEach(p => p.page.destroy()); //#96
        this.stack = this.stack.filter(p => p.parent !== parent);
        return this.stack.length !== lengthBefore;
    }

    /** Power off (#96) */
    public destroyAll(): void {
        this.stack.forEach(p => p.page.destroy());
        this.stack = [];
    }

}

class OverlayStack {

    private stack: (SixLinePage | SevenLinePage)[] = [];

    public push(page: SixLinePage | SevenLinePage): void {
        this.stack.push(page);
    }

    public pop(): SixLinePage | SevenLinePage {
        if (this.stack.length === 0) {
            throw new Error("No pages left to pop");
        }
        const page = this.stack.pop()!;
        page.destroy(); //#96
        return page;
    }

    /**
     * Removes the page of that type wherever it lies: a super page ends while the MSG page may lie above it (#334)
     */
    public remove(type: typeof SuperNav1Page | typeof SuperNav5Page | typeof Set0Page): void {
        const idx = this.stack.findIndex(page => page instanceof type);
        if (idx !== -1) {
            this.stack[idx].destroy(); //#96
            this.stack.splice(idx, 1);
        }
    }

    /** Power off (#96) */
    public destroyAll(): void {
        this.stack.forEach(p => p.destroy());
        this.stack = [];
    }

    public getCurrentPage(): SixLinePage | SevenLinePage | null {
        if (this.stack.length === 0) {
            return null;
        }
        return this.stack[this.stack.length - 1];
    }

    public contains(type: typeof SuperNav1Page | typeof SuperNav5Page | typeof Set0Page): boolean {
        for (const page of this.stack) {
            if (page instanceof type) {
                return true;
            }
        }
        return false;
    }

    /**
     * Returns, wether an overlaypage is currently shown
     */
    public isShown(): boolean {
        return this.stack.length > 0;
    }
}


/** The keys that close the MSG page and then act on the page beneath (#333) */
const MSG_CLOSING_EVENTS = [
    EVT_L_OUTER_LEFT, EVT_L_OUTER_RIGHT, EVT_R_OUTER_LEFT, EVT_R_OUTER_RIGHT,
    EVT_L_INNER_LEFT, EVT_L_INNER_RIGHT, EVT_R_INNER_LEFT, EVT_R_INNER_RIGHT,
    EVT_L_CURSOR, EVT_R_CURSOR,
];

/**
 * This is the primary page, that will be shown after all the startup screens. The outer and inner knobs
 * can be used to switch between indiviual pages, called SixLineHalfPage here.
 * The page trees are defined in PageTreeController.
 */
export class MainPage extends DisplayComponent<FivePageProps> implements Page {


    readonly children = NO_CHILDREN; //wo do all updates ourself
    protected readonly leftRef: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();
    protected readonly rightRef: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();
    protected readonly overlayRef: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();
    protected rerenderLeftPage = false;
    protected rerenderRightPage = false;
    protected rerenderOverlayPage = false;
    private leftPageStack = new PageStack();
    private rightPageStack = new PageStack();
    //This full screen covers the left and the right page. User for the Super NAV 1, Super NAV 5 and message screen
    private overlayPageStack = new OverlayStack();
    private readonly statusLine = new StatusLine({...this.props, "screen": this});
    private leftTreeController: PageTreeController;
    private rightTreeController: PageTreeController;

    constructor(props: FivePageProps) {
        super(props);

        this.leftTreeController = new PageTreeController(LEFT_PAGE_TREE, this.props.lPage, this.props, this.setLeftPage.bind(this));
        this.rightTreeController = new PageTreeController(RIGHT_PAGE_TREE, this.props.rPage, this.props, this.setRightPage.bind(this));

        this.leftPageStack.push(this.props.lPage, null);
        this.rightPageStack.push(this.props.rPage, null);

        //We do not use these fields anymore, and we want to allow those instances to be freed
        // @ts-ignore
        this.props.lPage = null;
        // @ts-ignore
        this.props.rPage = null;
    }

    render(): VNode {
        return (
            <div>
                <div ref={this.leftRef} class="left-page">
                    {this.getLeftPage().render()}
                </div>
                <div ref={this.rightRef} class="right-page">
                    {this.getRightPage().render()}
                </div>
                <div ref={this.overlayRef} class="d-none full-page">
                </div>
                {this.statusLine.render()}
            </div>

        );
    }

    public getLeftPage(): SixLineHalfPage {
        return this.leftPageStack.getCurrentPage();
    }

    public getRightPage(): SixLineHalfPage {
        return this.rightPageStack.getCurrentPage();
    }

    public getOverlayPage(): SixLinePage | SevenLinePage | null {
        return this.overlayPageStack.getCurrentPage();
    }


    public setLeftPage(page: SixLineHalfPage) {
        this.leftPageStack.setCurrentPage(page);
        this.leftTreeController.setPage(page);
        this.rerenderLeftPage = true;
        this.checkIfSuperPageIsShown();
    }

    /**
     * #395, the maintainer's ruling: the EFB load always wins. Every page pushed on the left closes (with its right-side
     * children), the right-side children of the old base page go too, and the page becomes the left base page
     */
    public replaceLeftBasePage(page: SixLineHalfPage): void {
        while (!this.leftPageStack.isBasePageShown()) {
            this.popLeftPage();
        }
        this.rerenderRightPage = this.rightPageStack.parentRemoved(this.leftPageStack.getCurrentPage()) || this.rerenderRightPage;
        this.setLeftPage(page);
    }

    public setRightPage(page: SixLineHalfPage) {
        this.rightPageStack.setCurrentPage(page);
        this.rightTreeController.setPage(page);
        this.rerenderRightPage = true;
        this.checkIfSuperPageIsShown();
    }

    /**
     * Displays an overlay page like Duplicate Waypoint or DCT
     * @param page
     * @param parent If a parent is defined, then this page will be removed, if the parent is removed
     * @param side
     */
    public pushPage(page: SixLineHalfPage, parent: SixLineHalfPage, side: PageSide) {
        if (side == PageSide.RightPage) {
            this.pushRightPage(page, parent);
        } else {
            this.pushLeftPage(page, parent);
        }
    }

    /**
     * Displays an overlay page like Duplicate Waypoint or DCT
     * @param page
     * @param parent
     */
    public pushLeftPage(page: SixLineHalfPage, parent: SixLineHalfPage | null) {
        this.leftPageStack.push(page, parent);
        this.rerenderLeftPage = true;
        this.checkIfSuperPageIsShown();
    }

    /**
     * Displays an overlay page like VNAV or Waypoint page
     * @param page
     * @param parent
     */
    public pushRightPage(page: SixLineHalfPage, parent: SixLineHalfPage | null) {
        this.rightPageStack.push(page, parent);
        this.rerenderRightPage = true;
        this.checkIfSuperPageIsShown();
    }

    public popLeftPage(): SixLineHalfPage {
        const oldPage = this.leftPageStack.pop();

        //#395: parentRemoved first, so that a flag already set by an earlier pop does not skip the children of this page
        this.rerenderRightPage = this.rightPageStack.parentRemoved(oldPage) || this.rerenderRightPage;

        this.rerenderLeftPage = true;
        this.checkIfSuperPageIsShown();
        return oldPage;
    }

    /**
     * True if the page is on the right stack, shown or covered by a page pushed on top of it (#262: the REF waypoint
     * page that a creation page pushes for approval)
     */
    public isInRightStack(page: SixLineHalfPage): boolean {
        return this.rightPageStack.contains(page);
    }

    public popRightPage(): SixLineHalfPage {
        const oldPage = this.rightPageStack.pop();

        //#395: the same order as in popLeftPage
        this.rerenderLeftPage = this.leftPageStack.parentRemoved(oldPage) || this.rerenderLeftPage;

        this.rerenderRightPage = true;
        this.checkIfSuperPageIsShown();
        return oldPage;
    }

    public popPage(side: PageSide) {
        if (side == PageSide.RightPage) {
            this.popRightPage();
        } else {
            this.popLeftPage();
        }
    }


    public pushOverlayPage(page: SixLinePage | SevenLinePage) {
        this.overlayPageStack.push(page);
        this.rerenderOverlayPage = true;
    }

    public popOverlayPage(): SixLinePage | SevenLinePage {
        const oldPage = this.overlayPageStack.pop();

        this.rerenderOverlayPage = true;
        return oldPage;
    }

    private removeOverlayPage(type: typeof SuperNav1Page | typeof SuperNav5Page | typeof Set0Page): void {
        this.overlayPageStack.remove(type);
        this.rerenderOverlayPage = true;
    }

    onInteractionEvent(evt: string): boolean {
        let leftPage: SixLineHalfPage;
        let rightPage: SixLineHalfPage;

        if (this.isMessagePageShown() && MSG_CLOSING_EVENTS.includes(evt)) {
            //#56, the KLN 89 trainer, 2026-10-09 (T3, T4): the knobs and CRSR close the MSG page and act on the page
            //beneath; CLR on it is ignored (#333)
            this.popOverlayPage();
            return this.onInteractionEvent(evt);
        }

        if (this.overlayPageStack.isShown()) {
            KeyboardService.routeKeyboardEvent(evt, this.getOverlayPage()!.lCursorController, this.getOverlayPage()!.rCursorController);
        } else {
            KeyboardService.routeKeyboardEvent(evt, this.getLeftPage().getCursorController(), this.getRightPage().getCursorController());
        }
        // noinspection FallThroughInSwitchStatementJS
        switch (evt) {
            case EVT_L_CURSOR:
                if (this.overlayPageStack.isShown()) {
                    return this.getOverlayPage()!.lCursorController.toggleCursor();
                }
                return this.getLeftPage().getCursorController().toggleCursor();
            case EVT_R_CURSOR:
                if (this.overlayPageStack.isShown()) {
                    return this.getOverlayPage()!.rCursorController.toggleCursor();
                }
                return this.getRightPage().getCursorController().toggleCursor();
            case EVT_L_OUTER_LEFT:
                if (this.overlayPageStack.isShown()) {
                    if (this.getOverlayPage()!.lCursorController.cursorActive) {
                        //#336: with the cursor on, a knob its field refuses does nothing (the KLN 89 trainer, 2026-10-09,
                        //T5, checked the inner knob on a prompt)
                        this.getOverlayPage()!.lCursorController.outerLeft();
                        return true;
                    } else if (this.isSuperPageShown()) {
                        this.leftTreeController.movePage(-1);
                    }
                    return true;
                }
                if (this.getLeftPage().getCursorController().cursorActive) {
                    return this.getLeftPage().getCursorController().outerLeft();
                } else if (this.leftPageStack.isBasePageShown()) {
                    this.leftTreeController.movePage(-1);
                } else {
                    //The KLN 89 trainer closes the page and then sends the event to the previos page, until it is handled
                    this.popLeftPage();
                    return this.onInteractionEvent(evt);
                }
                return true;
            case EVT_L_OUTER_RIGHT:
                if (this.overlayPageStack.isShown()) {
                    if (this.getOverlayPage()!.lCursorController.cursorActive) {
                        this.getOverlayPage()!.lCursorController.outerRight();
                        return true;
                    } else if (this.isSuperPageShown()) {
                        this.leftTreeController.movePage(1);
                    }
                    return true;
                }
                if (this.getLeftPage().getCursorController().cursorActive) {
                    return this.getLeftPage().getCursorController().outerRight();
                } else if (this.leftPageStack.isBasePageShown()) {
                    this.leftTreeController.movePage(1);
                } else {
                    //The KLN 89 trainer closes the page and then sends the event to the previos page, until it is handled
                    this.popLeftPage();
                    return this.onInteractionEvent(evt);
                }
                return true;
            case EVT_R_OUTER_LEFT:
                if (this.overlayPageStack.isShown()) {
                    if (this.getOverlayPage()!.rCursorController.cursorActive) {
                        this.getOverlayPage()!.rCursorController.outerLeft();
                        return true;
                    } else if (this.isSuperPageShown()) {
                        this.rightTreeController.movePage(-1);
                    }
                    return true;
                }
                if (this.getRightPage().getCursorController().cursorActive) {
                    return this.getRightPage().getCursorController().outerLeft();
                } else if (this.rightPageStack.isBasePageShown()) {
                    this.rightTreeController.movePage(-1);
                } else {
                    //The KLN 89 trainer closes the page and then sends the event to the previos page, until it is handled
                    this.popRightPage();
                    return this.onInteractionEvent(evt);
                }
                return true;
            case EVT_R_OUTER_RIGHT:
                if (this.overlayPageStack.isShown()) {
                    if (this.getOverlayPage()!.rCursorController.cursorActive) {
                        this.getOverlayPage()!.rCursorController.outerRight();
                        return true;
                    } else if (this.isSuperPageShown()) {
                        this.rightTreeController.movePage(1);
                    }
                    return true;
                }
                if (this.getRightPage().getCursorController().cursorActive) {
                    return this.getRightPage().getCursorController().outerRight();
                } else if (this.rightPageStack.isBasePageShown()) {
                    this.rightTreeController.movePage(1);
                } else {
                    //The KLN 89 trainer closes the page and then sends the event to the previos page, until it is handled
                    this.popRightPage();
                    return this.onInteractionEvent(evt);
                }
                return true;
            case EVT_L_INNER_LEFT:
                if (this.overlayPageStack.isShown()) {
                    if (this.getOverlayPage()!.lCursorController.cursorActive) {
                        //#336: with the cursor on, a knob its field refuses does nothing (the KLN 89 trainer, 2026-10-09,
                        //T5, checked the inner knob on a prompt)
                        this.getOverlayPage()!.lCursorController.innerLeft();
                        return true;
                    } else if (this.isSuperPageShown()) {
                        this.leftTreeController.moveSubpage(-1);
                    }
                    return true;
                }
                leftPage = this.getLeftPage();
                if (leftPage.getCursorController().cursorActive) {
                    return leftPage.getCursorController().innerLeft();
                } else if (isCustomPageTreeController(leftPage)) {
                    leftPage.pageTreeController.moveSubpage(-1);
                } else if (this.leftPageStack.isBasePageShown()) {
                    this.leftTreeController.moveSubpage(-1);
                } else {
                    //The KLN 89 trainer closes the page and then sends the event to the previos page, until it is handled
                    this.popLeftPage();
                    return this.onInteractionEvent(evt);
                }
                return true;
            case EVT_L_INNER_RIGHT:
                if (this.overlayPageStack.isShown()) {
                    if (this.getOverlayPage()!.lCursorController.cursorActive) {
                        this.getOverlayPage()!.lCursorController.innerRight();
                        return true;
                    } else if (this.isSuperPageShown()) {
                        this.leftTreeController.moveSubpage(1);
                    }
                    return true;
                }
                leftPage = this.getLeftPage();
                if (leftPage.getCursorController().cursorActive) {
                    return leftPage.getCursorController().innerRight();
                } else if (isCustomPageTreeController(leftPage)) {
                    leftPage.pageTreeController.moveSubpage(1);
                } else if (this.leftPageStack.isBasePageShown()) {
                    this.leftTreeController.moveSubpage(1);
                } else {
                    //The KLN 89 trainer closes the page and then sends the event to the previos page, until it is handled
                    this.popLeftPage();
                    return this.onInteractionEvent(evt);
                }
                return true;
            case EVT_R_SCAN: {
                //#394: Super NAV 5 closes its menu when the knob is pulled
                const overlay = this.getOverlayPage();
                if (overlay instanceof SuperNav5Page) {
                    overlay.scanPulledChanged();
                    return true;
                }
                return false;
            }
            case EVT_R_SCAN_LEFT:
                //#394: with an overlay shown, its own right cursor decides
                if (!this.isRightCursorActive()) {
                    if (this.overlayPageStack.isShown()) {
                        return this.getOverlayPage()!.scanLeft();
                    }
                    return this.getRightPage().scanLeft();
                }
            //Falltrough! Based on the KLN 89 trainer it behaves like EVT_R_INNER_LEFT when the cursor is active
            case EVT_R_INNER_LEFT:
                if (this.overlayPageStack.isShown()) {
                    if (this.getOverlayPage()!.rCursorController.cursorActive) {
                        this.getOverlayPage()!.rCursorController.innerLeft();
                        return true;
                    } else if (this.isSuperPageShown()) {
                        this.rightTreeController.moveSubpage(-1);
                    }
                    return true;
                }
                rightPage = this.getRightPage();
                if (rightPage.getCursorController().cursorActive) {
                    return rightPage.getCursorController().innerLeft();
                } else if (isCustomPageTreeController(rightPage)) {
                    rightPage.pageTreeController.moveSubpage(-1);
                } else if (this.rightPageStack.isBasePageShown()) {
                    this.rightTreeController.moveSubpage(-1);
                } else {
                    //The KLN 89 trainer closes the page and then sends the event to the previos page, until it is handled
                    this.popRightPage();
                    return this.onInteractionEvent(evt);
                }
                return true;
            case EVT_R_SCAN_RIGHT:
                //#394: with an overlay shown, its own right cursor decides
                if (!this.isRightCursorActive()) {
                    if (this.overlayPageStack.isShown()) {
                        return this.getOverlayPage()!.scanRight();
                    }
                    return this.getRightPage().scanRight();
                }
            //Falltrough! Based on the KLN 89 trainer it behaves like EVT_R_INNER_LEFT when the cursor is active
            case EVT_R_INNER_RIGHT:
                if (this.overlayPageStack.isShown()) {
                    if (this.getOverlayPage()!.rCursorController.cursorActive) {
                        this.getOverlayPage()!.rCursorController.innerRight();
                        return true;
                    } else if (this.isSuperPageShown()) {
                        this.rightTreeController.moveSubpage(1);
                    }
                    return true;
                }
                rightPage = this.getRightPage();
                if (rightPage.getCursorController().cursorActive) {
                    return rightPage.getCursorController().innerRight();
                } else if (isCustomPageTreeController(rightPage)) {
                    rightPage.pageTreeController.moveSubpage(1);
                } else if (this.rightPageStack.isBasePageShown()) {
                    this.rightTreeController.moveSubpage(1);
                } else {
                    //The KLN 89 trainer closes the page and then sends the event to the previos page, until it is handled
                    this.popRightPage();
                    return this.onInteractionEvent(evt);
                }
                return true;
            case EVT_ENT:
                if (this.overlayPageStack.isShown()) {
                    return this.getOverlayPage()!.enter();
                }
                reportErrors(this.handleEnter(), this.props.bus);
                return true;
            case EVT_CLR:
                if (this.overlayPageStack.isShown()) {
                    return this.getOverlayPage()!.clear();
                }
                //#307: as with ENT, a side with an open entry takes CLR first, so a page that answers CLR on the
                //other side (FPL with its cursor off asks DELETE FPL?, 4-5) does not take it away
                if (!this.getLeftPage().hasOpenEntry() && this.getRightPage().hasOpenEntry()) {
                    return this.getRightPage().clear() || this.getLeftPage().clear();
                }
                return this.getLeftPage().clear() || this.getRightPage().clear();
            case EVT_MSG:
                if (this.getOverlayPage() instanceof MessagePage) {
                    return this.getOverlayPage()!.msg();
                } else {
                    this.pushOverlayPage(new MessagePage(this.props));
                    return true;
                }
            case EVT_DCT:
                if (this.isMessagePageShown()) {
                    //3-27 (3-39, 3-55 for ALT) and the KLN 89 trainer, 2026-10-09 (T1, T2): the key closes the MSG page
                    //and its page shows at once (#335)
                    this.popOverlayPage();
                }
                leftPage = this.getLeftPage();
                if (leftPage instanceof DirectToPage) {
                    leftPage.directToPressed();
                } else {
                    this.pushLeftPage(new DirectToPage(this.props), null);
                }
                return true;
            case EVT_ALT:
                if (this.isMessagePageShown()) {
                    //3-27 (3-39, 3-55 for ALT) and the KLN 89 trainer, 2026-10-09 (T1, T2): the key closes the MSG page
                    //and its page shows at once (#335)
                    this.popOverlayPage();
                }
                leftPage = this.getLeftPage();
                if (leftPage instanceof AltPage) {
                    this.popLeftPage();
                } else {
                    const altPage = new AltPage(this.props);
                    this.pushLeftPage(altPage, null);
                    const page = new Nav4RightPage(this.props);
                    page.getCursorController().setCursorActive(true);
                    this.pushRightPage(page, altPage);
                }
                return true;
            case EVT_APPR_ARM:
                this.props.modeController.armApproachPressed();
                return true;
        }
        return false;
    }

    leftPageName(): string {
        if (this.overlayPageStack.isShown()) {
            const page = this.getOverlayPage()!;
            return page instanceof SixLinePage ? page.name : "     ";
        }
        let name = this.getLeftPage().name;
        if (this.getLeftPage().numPages > 1) {
            name = `${name.substring(0, 3)}+${name.substring(4, 5)}`;
        }
        return name;
    }

    rightPageName(): string {
        if (this.overlayPageStack.isShown()) {
            const page = this.getOverlayPage()!;
            return page instanceof SixLinePage ? page.name : "     ";
        }
        let name = this.getRightPage().name;
        if (this.getRightPage().numPages > 1) {
            name = `${name.substring(0, 3)}+${name.substring(4, 5)}`;
        }
        return name;
    }

    isEnterAccepted(): boolean {
        if (this.overlayPageStack.isShown()) {
            return this.getOverlayPage()!.isEnterAccepted();
        }
        return this.getLeftPage().isEnterAccepted() || this.getRightPage().isEnterAccepted();
    }

    isLeftCursorActive(): boolean {
        if (this.overlayPageStack.isShown()) {
            return this.getOverlayPage()!.lCursorController.cursorActive;
        }
        return this.getLeftPage().getCursorController().cursorActive;
    }

    isRightCursorActive(): boolean {
        if (this.overlayPageStack.isShown()) {
            return this.getOverlayPage()!.rCursorController.cursorActive;
        }
        return this.getRightPage().getCursorController().cursorActive;
    }

    tick(blink: boolean): void {
        if (this.rerenderOverlayPage) {
            this.overlayRef.instance.innerHTML = "";
            if (this.overlayPageStack.isShown()) {
                FSComponent.render(this.getOverlayPage()!.render()!, this.overlayRef.instance);
                this.leftRef.instance.classList.add("d-none");
                this.rightRef.instance.classList.add("d-none");
                this.overlayRef.instance.classList.remove("d-none");
                this.statusLine.isVisible = !(this.getOverlayPage() instanceof SevenLinePage);
            } else {
                this.leftRef.instance.classList.remove("d-none");
                this.rightRef.instance.classList.remove("d-none");
                this.overlayRef.instance.classList.add("d-none");
                this.statusLine.isVisible = true;
            }
            this.rerenderOverlayPage = false;
        }

        const leftPage = this.getLeftPage();
        const rightPage = this.getRightPage();

        if (this.rerenderLeftPage) {
            this.leftRef.instance.innerHTML = "";
            FSComponent.render(leftPage.render(), this.leftRef.instance);
            this.rerenderLeftPage = false;
        }
        if (this.rerenderRightPage) {
            this.rightRef.instance.innerHTML = "";
            FSComponent.render(rightPage.render(), this.rightRef.instance);
            this.rerenderRightPage = false;
        }

        //We direct the ticks ourself
        this.statusLine.tick(blink);
        this.statusLine.children.walk((el) => el.tick(blink));

        if (this.overlayPageStack.isShown()) {
            this.getOverlayPage()!.tick(blink);
            this.getOverlayPage()!.children.walk((el) => el.tick(blink));
        } else {
            leftPage.tick(blink);
            leftPage.children.walk((el) => el.tick(blink));
            rightPage.tick(blink);
            rightPage.children.walk((el) => el.tick(blink));
        }
    }

    public isMessagePageShown(): boolean {
        return this.overlayPageStack.isShown() && this.getOverlayPage() instanceof MessagePage;
    }

    private checkIfSuperPageIsShown() {
        const showSuperNav1 = this.getLeftPage() instanceof Nav1Page && this.getRightPage() instanceof Nav1Page;
        const superNav1Shown = this.overlayPageStack.contains(SuperNav1Page);
        if (showSuperNav1 && !superNav1Shown) {
            this.pushOverlayPage(new SuperNav1Page(this.props));
        } else if (!showSuperNav1 && superNav1Shown) {
            this.removeOverlayPage(SuperNav1Page);
        }
        const showSuperNav5 = this.getLeftPage() instanceof Nav5Page && this.getRightPage() instanceof Nav5Page;
        const superNav5Shown = this.overlayPageStack.contains(SuperNav5Page);
        if (showSuperNav5 && !superNav5Shown) {
            this.pushOverlayPage(new SuperNav5Page(this.props));
        } else if (!showSuperNav5 && superNav5Shown) {
            this.removeOverlayPage(SuperNav5Page);
        }

        const showSet0 = this.getLeftPage() instanceof Set0DummyPage;
        const set0Shown = this.overlayPageStack.contains(Set0Page);
        if (showSet0 && !set0Shown) {
            this.pushOverlayPage(new Set0Page(this.props));
        } else if (!showSet0 && set0Shown) {
            this.removeOverlayPage(Set0Page);
        }


    }

    private isSuperPageShown() {
        const overlayPage = this.getOverlayPage();
        return overlayPage instanceof SuperNav1Page || overlayPage instanceof SuperNav5Page || overlayPage instanceof Set0Page;
    }

    private async handleEnter(): Promise<boolean> {
        if (this.getLeftPage().isEnterAccepted()) { //If right requires confirmation, then it has priority
            return await this.getLeftPage().enter() != EnterResult.Not_Handled;
        } else if (this.getRightPage().isEnterAccepted()) { //If right requires confirmation, then it has priority
            return await this.getRightPage().enter() != EnterResult.Not_Handled;
        }


        //Otherwise, we see if left does something
        if (await this.getLeftPage().enter() != EnterResult.Not_Handled) {
            return true;
        }

        //Next right
        return await this.getRightPage().enter() != EnterResult.Not_Handled;
    }

    public destroy(): void {
        //#96 power off
        this.leftPageStack.destroyAll();
        this.rightPageStack.destroyAll();
        this.overlayPageStack.destroyAll();
        this.statusLine.destroy();
        super.destroy();
    }

    public hasStatusline(): boolean {
        const overlayPage = this.getOverlayPage();
        return !(overlayPage instanceof SuperNav5Page);
    }
}
