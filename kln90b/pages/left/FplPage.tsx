import {Facility, FSComponent, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {NO_CHILDREN, PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {MainPage} from "../MainPage";
import {FlightplanList} from "../../controls/FlightplanList";
import {FlightPlan} from "../../data/flightplan/FlightPlan";


type FplPageTypes = {
    wptList: FlightplanList
}

interface FplPageProps extends PageProps {
    page: number,
}

/**
 * 5-2
 */
export abstract class FplPage extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<FplPageTypes>;
    public readonly fplIdx: number;
    readonly name: string;
    private readonly flightplan: FlightPlan;

    protected constructor(props: FplPageProps) {
        super(props);
        this.fplIdx = props.page;
        this.flightplan = this.props.memory.fplPage.flightplans[this.fplIdx];

        this.name = `FPL${props.page.toString().padStart(2, " ")}`;

        this.cursorController = new CursorController(NO_CHILDREN);

        this.children = new UIElementChildren<FplPageTypes>({
            wptList: FlightplanList.build(
                this.cursorController,
                this,
                this.flightplan,
                this.props,
                this.loadFpl0.bind(this),
                this.useFpl.bind(this),
                this.useInvertedFpl.bind(this),
            ),
        });

        if (this.fplIdx > 0 && this.flightplan.getLegs().length === 0) {
            this.cursorController.cursorField = 1; //first wpt
        }

        this.cursorController.refreshChildren(this.children);
    }


    public render(): VNode {
        return (<pre>{this.children.get("wptList").render()}</pre>);
    }

    public getSelectedWaypoint(): Facility | null {
        if (!this.cursorController.cursorActive) {
            return null;
        }

        return this.children.get("wptList").getSelectedWaypoint();
    }

    /**
     * 4-5
     */
    public clear(): boolean {
        if (!this.cursorController.cursorActive) {
            this.children.get("wptList").askDeleteAll();
            return true;
        }

        return this.cursorController.clear();
    }

    public getVisibleLegsIndices(): [number, number, number, number, number, number] {
        return this.children.get("wptList").getVisibleLegsIndices();
    }

    public insertRefWpt(wpt: Facility, idx: number) {
        return this.children.get("wptList").insertRefWpt(wpt, idx);
    }

    public refreshFpl() {
        this.children.get("wptList").refreshFpl();
    }

    /**
     * 4-6
     * @private
     */
    private loadFpl0() {
        this.children.get("wptList").load(this.props.memory.fplPage.flightplans[0]);
    }

    /**
     * 4-3
     * @private
     */
    private useInvertedFpl() {
        this.props.memory.fplPage.flightplans[0].loadInverted(this.flightplan);

        const mainPage = this.props.pageManager.getCurrentPage() as MainPage;
        mainPage.setLeftPage(new Fpl0Page(this.props));
    }

    /**
     * 4-4
     * @private
     */
    private useFpl() {
        this.props.memory.fplPage.flightplans[0].load(this.flightplan);

        const mainPage = this.props.pageManager.getCurrentPage() as MainPage;
        mainPage.setLeftPage(new Fpl0Page(this.props));
    }

}

export class Fpl0Page extends FplPage {

    constructor(props: PageProps) {
        super({...props, page: 0});
    }
}

export class Fpl1Page extends FplPage {

    constructor(props: PageProps) {
        super({...props, page: 1});
    }
}

export class Fpl2Page extends FplPage {

    constructor(props: PageProps) {
        super({...props, page: 2});
    }
}

export class Fpl3Page extends FplPage {

    constructor(props: PageProps) {
        super({...props, page: 3});
    }
}

export class Fpl4Page extends FplPage {

    constructor(props: PageProps) {
        super({...props, page: 4});
    }
}

export class Fpl5Page extends FplPage {

    constructor(props: PageProps) {
        super({...props, page: 5});
    }
}

export class Fpl6Page extends FplPage {

    constructor(props: PageProps) {
        super({...props, page: 6});
    }
}

export class Fpl7Page extends FplPage {

    constructor(props: PageProps) {
        super({...props, page: 7});
    }
}

export class Fpl8Page extends FplPage {

    constructor(props: PageProps) {
        super({...props, page: 8});
    }
}

export class Fpl9Page extends FplPage {

    constructor(props: PageProps) {
        super({...props, page: 9});
    }
}

export class Fpl10Page extends FplPage {

    constructor(props: PageProps) {
        super({...props, page: 10});
    }
}

export class Fpl11Page extends FplPage {

    constructor(props: PageProps) {
        super({...props, page: 11});
    }
}

export class Fpl12Page extends FplPage {

    constructor(props: PageProps) {
        super({...props, page: 12});
    }
}

export class Fpl13Page extends FplPage {

    constructor(props: PageProps) {
        super({...props, page: 13});
    }
}

export class Fpl14Page extends FplPage {

    constructor(props: PageProps) {
        super({...props, page: 14});
    }
}

export class Fpl15Page extends FplPage {

    constructor(props: PageProps) {
        super({...props, page: 15});
    }
}

export class Fpl16Page extends FplPage {

    constructor(props: PageProps) {
        super({...props, page: 16});
    }
}

export class Fpl17Page extends FplPage {

    constructor(props: PageProps) {
        super({...props, page: 17});
    }
}

export class Fpl18Page extends FplPage {

    constructor(props: PageProps) {
        super({...props, page: 18});
    }
}

export class Fpl19Page extends FplPage {

    constructor(props: PageProps) {
        super({...props, page: 19});
    }
}

export class Fpl20Page extends FplPage {

    constructor(props: PageProps) {
        super({...props, page: 20});
    }
}

export class Fpl21Page extends FplPage {

    constructor(props: PageProps) {
        super({...props, page: 21});
    }
}

export class Fpl22Page extends FplPage {

    constructor(props: PageProps) {
        super({...props, page: 22});
    }
}

export class Fpl23Page extends FplPage {

    constructor(props: PageProps) {
        super({...props, page: 23});
    }
}

export class Fpl24Page extends FplPage {

    constructor(props: PageProps) {
        super({...props, page: 24});
    }
}

export class Fpl25Page extends FplPage {

    constructor(props: PageProps) {
        super({...props, page: 25});
    }
}
