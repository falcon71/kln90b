import {FSComponent, NodeReference, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps} from "../Page";
import {NO_CURSOR_CONTROLLER} from "../CursorController";
import {Dt1FplPage} from "./Dt1FplPage";
import {Dt1OtherPage} from "./Dt1OtherPage";
import {MainPage} from "../MainPage";
import {FplPage} from "../left/FplPage";


/**
 * 4-12
 */
export class Dt1Page extends SixLineHalfPage {

    public cursorController = NO_CURSOR_CONTROLLER;
    public children;

    readonly name: string = "D/T 1";

    private readonly ref: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();


    private readonly fplPage: Dt1FplPage;
    private readonly otherPage: Dt1OtherPage;

    private displayPage: Dt1FplPage | Dt1OtherPage;

    constructor(props: PageProps) {
        super(props);


        this.fplPage = new Dt1FplPage(props);
        this.otherPage = new Dt1OtherPage(props);

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

    private setPage(newPage: Dt1FplPage | Dt1OtherPage) {
        if (this.displayPage !== newPage) {
            this.displayPage = newPage;
            this.children = newPage.children;
            this.cursorController = newPage.cursorController;
            this.requiresRedraw = true;
        }
    }


}