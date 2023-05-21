import {DisplayComponent, FSComponent, VNode} from "@microsoft/msfs-sdk";


export class Inverted extends DisplayComponent<any> {

    render(): VNode | null {
        return (<span class="inverted">{this.props.children}</span>);
    }
}