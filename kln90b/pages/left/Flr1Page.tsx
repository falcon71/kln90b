import {FSComponent, NodeReference, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {CursorController, EnterResult, NO_CURSOR_CONTROLLER} from "../CursorController";
import {PageProps, UIElementChildren} from "../Page";
import {CustomPageTreeController, PageTreeController} from "../PageTreeController";
import {Button} from "../../controls/Button";
import {MtbfEditor} from "../../controls/editors/MtbfEditor";
import {TickController} from "../../TickController";
import {StatusLineMessageEvents} from "../../controls/StatusLine";
import {Flr2Page} from "./Flr2Page";
import {Flr3Page} from "./Flr3Page";

/**
 * The failure pages (#458). They are fictional: the real unit has no such pages. They are reached only through the
 * FAILURES button of SET 10 and have a tree of their own, which the knobs turn like the page tree of the ACT page.
 * The outer knob closes them.
 */
type FlrPageTypes = {
    page: SixLineHalfPage,
}

export class FlrPage extends SixLineHalfPage implements CustomPageTreeController {

    public readonly cursorController: CursorController = NO_CURSOR_CONTROLLER;
    public readonly children: UIElementChildren<FlrPageTypes>;

    public name: string;
    public pageTreeController: PageTreeController;

    private readonly ref: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();
    private shownPage: SixLineHalfPage;

    constructor(props: PageProps) {
        super(props);

        this.shownPage = new Flr1Page(props);
        this.pageTreeController = new PageTreeController(FLR_PAGE_TREE, this.shownPage, props, this.pageChanged.bind(this));
        this.name = this.pageTreeController.currentPage.name;
        this.children = new UIElementChildren({
            page: this.pageTreeController.currentPage,
        });
    }

    public render(): VNode {
        return (<div ref={this.ref}>{this.pageTreeController.currentPage.render()}</div>);
    }

    public isEnterAccepted(): boolean {
        return this.pageTreeController.currentPage.isEnterAccepted();
    }

    public enter(): Promise<EnterResult> {
        return this.pageTreeController.currentPage.enter();
    }

    public clear(): boolean {
        return this.pageTreeController.currentPage.clear();
    }

    public getCursorController(): CursorController {
        return this.pageTreeController.currentPage.getCursorController();
    }

    protected redraw(): void {
        this.ref.instance.innerHTML = "";
        FSComponent.render(this.pageTreeController.currentPage.render(), this.ref.instance);
    }

    public destroy(): void {
        this.shownPage.destroy(); //#96: the FLR 2 and FLR 3 pages hold a subscription
        super.destroy();
    }

    private pageChanged(page: SixLineHalfPage) {
        this.shownPage.destroy(); //#96: the tree does not destroy the page it replaces
        this.shownPage = page;
        this.name = page.name;
        this.numPages = page.numPages;
        this.children.set("page", page);
        this.requiresRedraw = true;
    }
}

/**
 * The SERVICE? button asks CONFIRM? before it repairs. The text changes inside the display tick, and the cursor stays on
 * the button. CLR withdraws the question.
 */
class ServiceButton extends Button {
    private asking = false;

    constructor(private readonly onConfirmed: () => void) {
        super("SERVICE?", () => undefined, () => undefined); //enter and clear are overridden
    }

    public enter(): Promise<EnterResult> {
        if (this.asking) {
            this.asking = false;
            this.onConfirmed();
        } else {
            this.asking = true;
        }
        return Promise.resolve(EnterResult.Handled_Keep_Focus);
    }

    public clear(): boolean {
        this.asking = false;
        return true;
    }

    public tick(blink: boolean): void {
        super.tick(blink);
        if (TickController.checkRef(this.ref)) {
            const text = this.asking ? "CONFIRM?" : "SERVICE?";
            if (this.ref.instance.textContent !== text) {
                this.ref.instance.textContent = text;
            }
        }
    }
}

type Flr1PageTypes = {
    mtbf: MtbfEditor,
    service: ServiceButton,
}

/**
 * docs/failures.md, FLR 1: the MTBF of the random failures, the battery (fixed until #461) and the service button
 */
export class Flr1Page extends SixLineHalfPage {

    public readonly cursorController: CursorController;
    public readonly children: UIElementChildren<Flr1PageTypes>;

    readonly name: string = "FLR 1";

    constructor(props: PageProps) {
        super(props);

        this.children = new UIElementChildren<Flr1PageTypes>({
            mtbf: new MtbfEditor(props.bus, props.failures.mtbfHours, (hours) => props.failures.setMtbfHours(hours)),
            service: new ServiceButton(() => this.serviced()),
        });
        this.cursorController = new CursorController(this.children);
    }

    public render(): VNode {
        return (<pre>
            MTBF:&nbsp&nbsp{this.children.get("mtbf").render()}<br/>
            BATTERY&nbsp100<br/>
            <br/>
            <br/>
            <br/>
            {this.children.get("service").render()}
        </pre>);
    }

    private serviced(): void {
        this.props.failures.repairAll();
        this.props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "SERVICED");
        this.cursorController.setCursorActive(false); //The service is done, nothing is left to enter (maintainer, 2026-11-04)
    }
}

/**
 * The failure pages (#458). Not part of LEFT_PAGE_TREE: only the FAILURES button of SET 10 opens them. The tree lives
 * here and not in PageTreeController, which imports only its type, so that the two modules form no import cycle
 */
export const FLR_PAGE_TREE = [
    [Flr1Page, Flr2Page, Flr3Page],
];
