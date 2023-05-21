import {FSComponent, NodeReference, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps} from "../Page";
import {NO_CURSOR_CONTROLLER} from "../CursorController";
import {Dt2FplPage} from "./Dt2FplPage";
import {Dt2OtherPage} from "./Dt2OtherPage";
import {MainPage} from "../MainPage";
import {FplPage} from "../left/FplPage";


/**
 * 4-12
 */
export class Dt2Page extends SixLineHalfPage {

    public cursorController = NO_CURSOR_CONTROLLER;
    public children;

    readonly name: string = "D/T 2";

    private readonly ref: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();


    private readonly fplPage: Dt2FplPage;
    private readonly otherPage: Dt2OtherPage;

    private displayPage: Dt2FplPage | Dt2OtherPage;

    constructor(props: PageProps) {
        super(props);


        this.fplPage = new Dt2FplPage(props);
        this.otherPage = new Dt2OtherPage(props);

        const mainPage = this.props.pageManager.getCurrentPage() as MainPage;
        const page = mainPage.getLeftPage();

        this.displayPage = page instanceof FplPage ? this.fplPage : this.otherPage;
        this.children = this.displayPage.children;
        this.cursorController = this.displayPage.cursorController;
    }

    public render(): VNode {
        return (
            <div ref={this.ref}>
                {this.displayPage.render()}
            </div>
        );
    }

    tick(blink: boolean) {
        const mainPage = this.props.pageManager.getCurrentPage() as MainPage;
        const page = mainPage.getLeftPage();
        this.setPage(page instanceof FplPage ? this.fplPage : this.otherPage);

        super.tick(blink);
        this.displayPage.tick(blink);
    }

    protected redraw(): void {
        this.ref.instance.innerHTML = "";
        FSComponent.render(this.displayPage.render(), this.ref.instance);
    }

    private setPage(newPage: Dt2FplPage | Dt2OtherPage) {
        if (this.displayPage !== newPage) {
            this.displayPage = newPage;
            this.children = newPage.children;
            this.cursorController = newPage.cursorController;
            this.requiresRedraw = true;
        }
    }


}