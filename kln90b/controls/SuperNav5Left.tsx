import {PageProps, UiElement, UIElementChildren} from "../pages/Page";
import {DistanceDisplay} from "./displays/DistanceDisplay";
import {TextDisplay} from "./displays/TextDisplay";
import {SpeedDisplay} from "./displays/SpeedDisplay";
import {FSComponent, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {SuperNav5Field1Selector} from "./selects/SuperNav5Field1Selector";
import {SuperNav5Field2Selector} from "./selects/SuperNav5Field2Selector";
import {SuperNav5Field3Selector} from "./selects/SuperNav5Field3Selector";
import {SuperNav5RangeSelector} from "./selects/SuperNav5RangeSelector";
import {NavMode} from "../data/VolatileMemory";
import {format} from "numerable";
import {SidStar} from "../data/navdata/SidStar";

type SuperNav5LeftTypes = {
    range: SuperNav5RangeSelector,
    distance: DistanceDisplay,
    ident: TextDisplay,
    mode: TextDisplay,
    groundspeed: SpeedDisplay,
    field1: SuperNav5Field1Selector,
    field2: SuperNav5Field2Selector,
    field3: SuperNav5Field3Selector,
}

export class SuperNav5Left implements UiElement {
    public readonly children: UIElementChildren<SuperNav5LeftTypes>;

    private readonly msgRef: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();

    constructor(private props: PageProps) {

        const rangeSetting = this.props.userSettings.getSetting("superNav5MapRange");

        this.children = new UIElementChildren<SuperNav5LeftTypes>({
            range: SuperNav5RangeSelector.build(rangeSetting, this.props.memory.navPage),
            distance: new DistanceDisplay(4, this.props.memory.navPage.distToActive),
            ident: new TextDisplay(this.getIdent()),
            mode: new TextDisplay(this.getModeString()),
            groundspeed: new SpeedDisplay(this.props.sensors.in.gps.groundspeed),
            field1: SuperNav5Field1Selector.build(this.props.userSettings.getSetting("superNav5Field1"), this.props.memory.navPage, this.props.vnav),
            field2: SuperNav5Field2Selector.build(this.props.userSettings.getSetting("superNav5Field2"), this.props.memory.navPage, this.props.sensors, this.props.planeSettings, this.props.modeController, this.props.magvar),
            field3: SuperNav5Field3Selector.build(this.props.userSettings.getSetting("superNav5Field3"), this.props.memory.navPage, this.props.sensors, this.props.magvar, this.props.memory.fplPage.flightplans[0]),
        });
    }

    public render(): VNode {
        return (<pre class="super-nav5-left-controls">
            {this.children.get("distance").render()} È<br/>
            {this.children.get("ident").render()}<br/>
            {this.children.get("mode").render()}<br/>
            &nbsp{this.children.get("groundspeed").render()} É<br/>
            {this.children.get("field1").render()}<br/>
            {this.children.get("field2").render()}<br/>
            {this.children.get("field3").render()}<br/>
            <div class="super-nav5-mgs-range">
                <span ref={this.msgRef}>   </span><br/>
                {this.children.get("range").render()}
            </div>
        </pre>);
    }

    public tick(blink: boolean): void {
        this.children.get("distance").distance = this.props.memory.navPage.distToActive;

        if (this.props.memory.navPage.waypointAlert && blink) { //4-8
            this.children.get("ident").text = "     "; //bit of a hack
        } else {
            this.children.get("ident").text = this.getIdent();
        }
        this.children.get("groundspeed").speed = this.props.sensors.in.gps.groundspeed;
        this.children.get("mode").text = this.getModeString();

        if (this.props.messageHandler.hasMessages()) {
            this.msgRef.instance.textContent = "msg";
            if (this.props.messageHandler.hasUnreadMessages()) {
                this.msgRef.instance.classList.add("inverted");
                if (blink) {
                    this.msgRef.instance.classList.add("inverted-blink");
                } else {
                    this.msgRef.instance.classList.remove("inverted-blink");
                }
            } else {
                this.msgRef.instance.classList.remove("inverted", "inverted-blink");
            }
        } else {
            this.msgRef.instance.classList.remove("inverted", "inverted-blink");
            this.msgRef.instance.textContent = "   ";
        }
    }

    private getIdent(): string {
        const leg = this.props.memory.navPage.activeWaypoint.getActiveLeg();
        if (leg === null) {
            return "";
        }
        return leg.wpt.icaoStruct.ident + SidStar.getWptSuffix(leg.fixType);
    }

    private getModeString(): string {
        switch (this.props.memory.navPage.navmode) {
            case NavMode.ENR_LEG:
                return "Ê-Ë";
            case NavMode.ENR_OBS:
                return `Ê${format(this.props.memory.navPage.obsMag, "000")}`;
            case NavMode.ARM_LEG:
                return "Í-Ë";
            case NavMode.ARM_OBS:
                return `Í:${format(this.props.memory.navPage.obsMag, "000")}`;
            case NavMode.APR_LEG:
                return "Ì-Ë";
        }
    }

}