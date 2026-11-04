import {FSComponent, Subscription, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {CursorController} from "../CursorController";
import {PageProps, UIElementChildren} from "../Page";
import {List} from "../../controls/List";
import {ConfirmListItem} from "../../controls/ListItem";
import {FailureDefinition, FailureKey} from "../../failures/FailureCatalog";
import {FailureChangedEvents} from "../../failures/Failures";

type FailureListPageTypes = {
    list: List,
}

/**
 * The shared part of FLR 2 and FLR 3 (#458, docs/failures.md, "UI"): a heading and a list of failures. A change of a
 * failure refreshes the list in the next display tick, whoever caused it (a random failure, the other page, a SERVICE)
 */
export abstract class FailureListPage extends SixLineHalfPage {

    public readonly cursorController: CursorController;
    public readonly children: UIElementChildren<FailureListPageTypes>;

    private readonly subscription: Subscription;
    private listChanged = false;

    protected constructor(props: PageProps, private readonly heading: string) {
        super(props);

        this.children = new UIElementChildren<FailureListPageTypes>({
            list: new List(UIElementChildren.forList(this.buildItems())),
        });
        this.cursorController = new CursorController(this.children);
        this.cursorController.setStartFieldProvider(() => this.children.get("list").topVisibleField());

        this.subscription = this.props.bus.getSubscriber<FailureChangedEvents>().on("failureChanged").handle(() => {
            this.listChanged = true; //The DOM follows in the next display tick
        });
    }

    protected abstract entries(): FailureDefinition[];

    protected abstract createItem(definition: FailureDefinition): ConfirmListItem<FailureKey>;

    public destroy(): void {
        this.subscription.destroy();
        super.destroy();
    }

    public render(): VNode {
        return (<pre>
            {this.heading}<br/>
            {this.children.get("list").render()}
        </pre>);
    }

    public tick(blink: boolean): void {
        if (this.listChanged) {
            this.listChanged = false;
            //A refresh replaces the entries, so a prompt that is open is cancelled
            this.children.get("list").refresh(UIElementChildren.forList(this.buildItems()));
            this.cursorController.refreshChildren(this.children);
        }
        super.tick(blink);
    }

    private buildItems(): ConfirmListItem<FailureKey>[] {
        return this.entries().map(d => this.createItem(d));
    }
}
