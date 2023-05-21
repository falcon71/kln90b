import {Facility, FSComponent, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, PageSide, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {AltitudeFieldset} from "../../controls/selects/AltitudeFieldset";
import {Degrees, Feet, NauticalMiles} from "../../data/Units";
import {WaypointEditor} from "../../controls/editors/WaypointEditor";
import {VnavAngleFieldset, VnavDistanceFieldset} from "../../controls/selects/VnavFieldsets";
import {VnavState} from "../../services/Vnav";
import {StatusLineMessageEvents} from "../../controls/StatusLine";


type Nav4PageTypes = {
    title: TextDisplay,
    ind: AltitudeFieldset,
    indLabel: TextDisplay,
    sel: AltitudeFieldset,
    selLabel: TextDisplay,
    vnavWpt: WaypointEditor,
    vnavDist: VnavDistanceFieldset,
    vnavAngle: VnavAngleFieldset,
}

/**
 * 3-36, 5-7
 */
abstract class Nav4Page extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Nav4PageTypes>;

    readonly name: string = "NAV 4";


    constructor(props: PageProps) {
        super(props);

        const indicatedAlt = this.props.sensors.in.airdata.getIndicatedAlt();


        this.children = new UIElementChildren<Nav4PageTypes>({
            title: new TextDisplay(this.getTitleString()),
            indLabel: new TextDisplay(indicatedAlt === null ? "FR :" : "IND "),
            ind: new AltitudeFieldset(Math.round((indicatedAlt ?? this.props.memory.navPage.nav4FromAlt) / 100) * 100, this.setFromAltitude.bind(this)),
            selLabel: new TextDisplay(indicatedAlt === null ? "TO :" : "SEL:"),
            sel: new AltitudeFieldset(this.props.memory.navPage.nav4SelectedAltitude, this.setSelectedAltitude.bind(this)),
            vnavWpt: new WaypointEditor({
                ...this.props,
                enterCallback: this.setVnavWpt.bind(this),
                value: this.props.vnav.getVnavWaypoint(),
                parent: this,
                pageSite: this.getPageSide(),
            }),
            vnavDist: new VnavDistanceFieldset(this.props.memory.navPage.nav4VnavDist, this.setVnavDist.bind(this)),
            vnavAngle: new VnavAngleFieldset(this.props.vnav.getAngle(), this.setVnavAngle.bind(this)),
        });

        this.children.get("ind").setReadonly(indicatedAlt !== null);

        this.cursorController = new CursorController(this.children);

    }

    public render(): VNode {
        return (<pre>
            {this.children.get("title").render()}<br/>
            <br/>
            {this.children.get("indLabel").render()}{this.children.get("ind").render()}ft<br/>
            {this.children.get("selLabel").render()}{this.children.get("sel").render()}ft<br/>
            {this.children.get("vnavWpt").render()}:-{this.children.get("vnavDist").render()}nm<br/>
            ANGLE:{this.children.get("vnavAngle").render()}°
        </pre>);
    }

    tick(blink: boolean) {
        this.requiresRedraw = true;
        super.tick(blink);

        if (this.children.get("vnavAngle").isFocused()) {
            this.props.vnav.armVnav();
        }
    }

    protected abstract getPageSide(): PageSide;

    protected redraw() {
        //We need to set everything, because this page could be open on both sides
        this.children.get("title").text = this.getTitleString();
        if (this.props.sensors.in.airdata.pressureAltitude === null) {
            this.children.get("ind").setValue(this.props.memory.navPage.nav4FromAlt);
        } else {
            this.children.get("ind").setValue(Math.round((this.props.sensors.in.airdata.getIndicatedAlt()!) / 100) * 100);
        }
        this.children.get("vnavWpt").setValue(this.props.vnav.getVnavWaypoint());
        this.children.get("vnavDist").setValue(this.props.memory.navPage.nav4VnavDist);
        this.children.get("vnavAngle").setValue(this.props.vnav.getAngle());
    }

    private getTitleString(): string {
        const vnav = this.props.vnav;
        switch (vnav.state) {
            case VnavState.Inactive:
                return "VNV INACTV";
            case VnavState.Armed:
                if (vnav.timeToVnav! / 60 > 10) {
                    return "VNV ARMED";
                } else {
                    return `VNV IN${this.props.vnav.formatDuration(vnav.timeToVnav)}`;
                }
            case VnavState.Active:
                return `VNV${this.formatAlt(vnav.advisoryAltitude!)}ft`;
        }
    }

    private formatAlt(targetAlt: Feet): string {
        return (Math.round(targetAlt / 100) * 100).toString().padStart(5, " ");
    }

    private setFromAltitude(alt: Feet): void {
        this.props.memory.navPage.nav4FromAlt = alt;
        this.props.vnav.disarmVnav();
    }

    private setSelectedAltitude(alt: Feet): void {
        this.props.memory.navPage.nav4SelectedAltitude = alt;
        this.props.vnav.disarmVnav();
    }

    private setVnavWpt(wpt: Facility | null) {
        if (wpt === null || !this.props.vnav.isValidVnavWpt(wpt)) {
            this.props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "INVALID VNV");
            return;
        }
        this.props.memory.navPage.nav4VnavWpt = wpt;
        this.props.vnav.disarmVnav();
    }

    private setVnavDist(dist: NauticalMiles): void {
        this.props.memory.navPage.nav4VnavDist = dist;
        this.props.vnav.disarmVnav();
    }

    private setVnavAngle(angle: Degrees): void {
        this.props.memory.navPage.nav4VnavAngle = angle;
    }


}

export class Nav4LeftPage extends Nav4Page {
    protected getPageSide(): PageSide {
        return PageSide.LeftPage;
    }

}

export class Nav4RightPage extends Nav4Page {
    protected getPageSide(): PageSide {
        return PageSide.RightPage;
    }

}