import {FSComponent, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {List} from "../../controls/List";
import {SimpleListItem} from "../../controls/ListItem";
import {RemarksChangedEvent} from "../../settings/RemarksManager";


type Oth4PageTypes = {
    rmksList: List
}

export class Oth4Page extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Oth4PageTypes>;

    readonly name: string = "OTH 4";

    constructor(props: PageProps) {
        super(props);

        const list = this.props.remarksManager.getAirportsWithRemarks().map(ident => new SimpleListItem({
            bus: this.props.bus,
            value: ident,
            fulltext: ident,
            onDelete: this.deleteRemark.bind(this),
        }));

        this.children = new UIElementChildren<Oth4PageTypes>({
            rmksList: new List(UIElementChildren.forList(list)),
        });
        this.cursorController = new CursorController(this.children);

        this.props.bus.getSubscriber<RemarksChangedEvent>().on("changed").whenChanged().handle(this.refreshList.bind(this));
    }

    public render(): VNode {
        return (<pre>
            APTS W/RMKS<br/>
            {this.children.get("rmksList").render()}
        </pre>);
    }

    private refreshList() {
        const list = this.props.remarksManager.getAirportsWithRemarks().map(ident => new SimpleListItem({
            bus: this.props.bus,
            value: ident,
            fulltext: ident,
            onDelete: this.deleteRemark.bind(this),
        }));

        this.children.get("rmksList").refresh(UIElementChildren.forList(list));

        this.cursorController.refreshChildren(this.children);

    }

    private deleteRemark(ident: string) {
        this.props.remarksManager.deleteRemarks(ident);
    }


}