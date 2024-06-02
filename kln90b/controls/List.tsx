import {FSComponent, NodeReference, VNode} from '@microsoft/msfs-sdk';
import {UiElement, UIElementChildren} from '../pages/Page';
import {TickController} from "../TickController";
import {isListItem} from "./ListItem";


export class List implements UiElement {
    protected scrollIdx = 0;
    protected classes = "";
    private readonly ref: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();

    public constructor(public children: UIElementChildren<any>, protected height: number = 5) {
    }

    public refresh(children: UIElementChildren<any>): void {
        if (!TickController.checkRef(this.ref)) {
            return;
        }
        this.children = children;
        this.scrollIdx = 0;
        this.redraw();
    }

    public render(): VNode {
        return (
            <div ref={this.ref} class={this.classes}>
                {this.renderInternal()}
            </div>
        );
    }

    tick(blink: boolean): void {
        const focusedIdx = this.children.getall().findIndex(el => isListItem(el) && el.isItemFocused());
        if (focusedIdx > -1) {
            const requiredScrollIdx = this.calculateRequiredScrollIdx(focusedIdx);

            if (requiredScrollIdx !== this.scrollIdx) {
                this.scrollIdx = requiredScrollIdx;
                if (!TickController.checkRef(this.ref)) {
                    return;
                }
                this.redraw();
            }
        }
    }

    protected getRowChild(row: number): UiElement | null {
        const rowIdx = row + this.scrollIdx;
        const childList = this.children.getall();
        if (rowIdx >= childList.length) {
            return null;
        }
        return childList[rowIdx];
    }

    protected calculateRequiredScrollIdx(focusedIdx: number) {
        let requiredScrollIdx = this.scrollIdx;
        if (focusedIdx < requiredScrollIdx) {
            requiredScrollIdx = focusedIdx;
        }
        if (focusedIdx >= requiredScrollIdx + this.height) {
            requiredScrollIdx = focusedIdx - this.height + 1;
        }
        return requiredScrollIdx;
    }

    protected redraw(): void {
        this.ref.instance.innerHTML = "";
        FSComponent.render(this.renderInternal(), this.ref.instance);
    }

    private renderInternal(): VNode {
        switch (this.height) {
            case 4:
                return (
                    <div>
                        {this.renderRow(0)}<br/>
                        {this.renderRow(1)}<br/>
                        {this.renderRow(2)}<br/>
                        {this.renderRow(3)}<br/>
                    </div>
                );
            case 5:
                return (
                    <div>
                        {this.renderRow(0)}<br/>
                        {this.renderRow(1)}<br/>
                        {this.renderRow(2)}<br/>
                        {this.renderRow(3)}<br/>
                        {this.renderRow(4)}<br/>
                    </div>
                );
            case 6:
                return (
                    <div>
                        {this.renderRow(0)}<br/>
                        {this.renderRow(1)}<br/>
                        {this.renderRow(2)}<br/>
                        {this.renderRow(3)}<br/>
                        {this.renderRow(4)}<br/>
                        {this.renderRow(5)}<br/>
                    </div>
                );
            default:
                throw new Error(`Height ${this.height} not implemented`);
        }
    }

    private renderRow(row: number): VNode | null {
        return this.getRowChild(row)?.render() ?? null;
    }


}

/**
 * Used on APT 7 and APT 8 pages. The last item is always visible
 */
export class LastItemAlwaysVisibleList extends List {
    protected getRowChild(row: number): UiElement | null {
        const childList = this.children.getall();
        if (row !== this.height - 1 || this.isLastElementInView(childList.length)) {
            return super.getRowChild(row);
        }

        return childList[childList.length - 1];
    }

    protected calculateRequiredScrollIdx(focusedIdx: number) {
        const childList = this.children.getall();
        let requiredScrollIdx = this.scrollIdx;
        if (focusedIdx < requiredScrollIdx) {
            requiredScrollIdx = focusedIdx;
        }
        if (focusedIdx < childList.length - 1) {
            if (focusedIdx >= requiredScrollIdx + this.height - 1) {
                requiredScrollIdx = focusedIdx - (this.height - 2);
            }
        } else {
            if (focusedIdx >= requiredScrollIdx + this.height) {
                requiredScrollIdx = focusedIdx - (this.height - 1);
            }
        }

        return requiredScrollIdx;
    }

    private isLastElementInView(numChildren: number): boolean {
        return this.scrollIdx + this.height >= numChildren;
    }
}

/**
 * This list is offset to the right
 */
export class Apt8IafList extends LastItemAlwaysVisibleList {

    protected classes = "apt-8-iaf-list";
}