import {Facility, FSComponent, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, PageSide, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {SimpleListItem} from "../../controls/ListItem";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {MainPage} from "../MainPage";

interface WaypointTypePageProps extends PageProps {
    fix: Facility,
    parent: SixLineHalfPage,
}

interface FullWaypointTypePageProps extends WaypointTypePageProps {
    resolve: (sidStar: boolean | null) => void,
}

type WaypointTypePageTypes = {
    ident: TextDisplay,
    enRoute: SimpleListItem<boolean>,
    sidStar: SimpleListItem<boolean>,
}

/**
 * 4-2..4-3, figure 4-7a: a SID/STAR waypoint that is flown over, entered into a flight plan, asks after its approval
 * whether it is used en route or as the SID/STAR waypoint. The waypoint page stays on the right meanwhile. The page name
 * and the CLR, which ends the entry as CLR on the approval does (4-2 step 7), are our own choices (design doc of #77)
 */
export class WaypointTypePage extends SixLineHalfPage {

    public readonly cursorController;
    readonly children;

    readonly name: string = "     ";

    private constructor(props: FullWaypointTypePageProps) {
        super(props);

        this.children = new UIElementChildren<WaypointTypePageTypes>({
            ident: new TextDisplay(props.fix.icaoStruct.ident.padEnd(11, " ")),
            enRoute: new SimpleListItem<boolean>({
                bus: this.props.bus,
                value: false,
                fulltext: "1 EN ROUTE?",
                onEnter: this.answer.bind(this),
            }),
            sidStar: new SimpleListItem<boolean>({
                bus: this.props.bus,
                value: true,
                fulltext: "2 SID/STAR?",
                onEnter: this.answer.bind(this),
            }),
        });
        this.cursorController = new CursorController(this.children);
        this.cursorController.setCursorActive(true);
    }

    /**
     * Shows the question on the left, over the flight plan page
     * @return true for SID/STAR, false for EN ROUTE, null for CLR. The page is gone when it resolves
     */
    public static ask(props: WaypointTypePageProps): Promise<boolean | null> {
        const mainPage = props.pageManager.getCurrentPage() as MainPage;
        return new Promise<boolean | null>((resolve) => {
            mainPage.pushPage(new WaypointTypePage({...props, resolve: resolve}), props.parent, PageSide.LeftPage);
        });
    }

    public render(): VNode {
        return (<pre>
            {this.children.get("ident").render()}<br/>
            &nbsp&nbspTYPE WPT<br/>
            <br/>
            {this.children.get("enRoute").render()}<br/>
            {this.children.get("sidStar").render()}
        </pre>);
    }

    /**
     * The question is open until it is answered: MainPage gives CLR to this side before the waypoint page on the right,
     * whose editor would otherwise take it (our choice)
     */
    public hasOpenEntry(): boolean {
        return true;
    }

    public clear(): boolean {
        this.answer(null);
        return true;
    }

    /**
     * The cursor stays on: without it, ENT would go to the waypoint page on the right and approve the waypoint without
     * an answer (our choice)
     */
    public cursorPressed(): boolean {
        return true;
    }

    private answer(sidStar: boolean | null): void {
        const props = this.props as FullWaypointTypePageProps;
        const mainPage = props.pageManager.getCurrentPage() as MainPage;
        mainPage.popPage(PageSide.LeftPage);
        props.resolve(sidStar);
    }
}
