import {NO_CHILDREN, PageProps} from "../pages/Page";
import {AirportFacility, FSComponent, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {SixLinePage} from "../pages/FourSegmentPage";
import {CursorController, NO_CURSOR_CONTROLLER} from "../pages/CursorController";
import {WaypointPageProps} from "../pages/right/WaypointPage";
import {Apt1Page} from "../pages/right/Apt1Page";
import {MainPage} from "../pages/MainPage";

const MAX_MESSAGE_HEIGHT = 6;

export class MessagePage extends SixLinePage {

    readonly children = NO_CHILDREN;
    public readonly lCursorController: CursorController = NO_CURSOR_CONTROLLER;
    public readonly rCursorController: CursorController = NO_CURSOR_CONTROLLER;
    protected requiresRedraw: boolean = true;
    private readonly ref: NodeReference<HTMLPreElement> = FSComponent.createRef<HTMLPreElement>();
    private currentPage = 0;
    private readonly pages: string[] = this.buildPages();

    constructor(props: PageProps) {
        super(props);
    }

    render(): VNode | null {
        return <pre ref={this.ref}> </pre>;
    }

    tick(blink: boolean): void {
        super.tick(blink);
        if (this.requiresRedraw) {
            this.redraw();
            this.requiresRedraw = false;
        }
    }

    /**
     * Cycles through the message pages. True, if there are no more messages and the page should be removed
     */
    public msg(): boolean {
        this.currentPage++;
        if (this.currentPage >= this.pages.length) {
            const mainPage = this.props.pageManager.getCurrentPage() as MainPage;
            mainPage.popOverlayPage();
            return true;
        }
        this.requiresRedraw = true;
        return true;
    }

    public enter(): boolean {
        const nearestList = this.props.nearestLists.aptNearestList.getNearestList();
        if (nearestList.length > 0) {  //see https://youtu.be/Q6m7_CVGPCg?t=12, the just removes the page, if the nearestlist is empty
            const mainPage = this.props.pageManager.getCurrentPage() as MainPage;
            mainPage.popOverlayPage();
            const props: WaypointPageProps<AirportFacility> = {
                facility: nearestList[0],
                ...this.props,
            };
            mainPage.setRightPage(new Apt1Page(props));
        }
        return true;
    }

    private buildPages(): string[] {
        this.currentPage = 0;
        const pages = [];
        const messages = [...this.props.messageHandler.getMessages()].reverse(); //Newest first

        let page = "";
        let numLines = 0;
        for (const message of messages) {
            if (numLines + message.message.length > MAX_MESSAGE_HEIGHT) {
                pages.push(page);
                page = "";
                numLines = 0;
            }
            page += message.message.join("\n ") + "\n"; //The space is deliberate
            numLines += message.message.length;
            message.seen = true;
        }
        pages.push(page);
        this.requiresRedraw = true;
        return pages;
    }

    private redraw() {
        this.ref.instance.textContent = this.pages[this.currentPage];
    }


}