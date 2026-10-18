import {FSComponent, NodeReference, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {BaroFieldset, BaroFieldsetFactory} from "../../controls/selects/BaroFieldset";
import {SelectField} from "../../controls/selects/SelectField";
import {Inhg} from "../../data/Units";
import {isBaroTransmitted} from "../../settings/KLN90BPlaneSettings";


type AltPageTypes = {
    baro: BaroFieldset,
    alert: SelectField,
    warn: SelectField,
}

export class AltPage extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<AltPageTypes>;

    readonly name: string = "ALT  "; //The KLN 89 and KLN 90B trainer display ALT

    protected readonly brRef: NodeReference<HTMLBRElement> = FSComponent.createRef<HTMLBRElement>();
    protected readonly warnRef: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();

    constructor(props: PageProps) {
        super(props);


        this.children = new UIElementChildren<AltPageTypes>({
            baro: BaroFieldsetFactory.createBaroFieldSet(this.props.sensors.in.airdata.barometer, this.props.userSettings, this.saveBaro.bind(this)),
            alert: new SelectField([" OFF", "ON ›"], this.isAlertOn() ? 1 : 0, this.setAlertEnabled.bind(this)),
            warn: new SelectField(["2", "3", "4", "5", "6", "7", "8", "9"], this.props.userSettings.getSetting("altAlertWarn").get() / 100 - 2, this.setAlertWarn.bind(this)),
        });

        const baroReadonly = isBaroTransmitted(this.props.planeSettings);
        const alertReadonly = !this.props.planeSettings.output.altitudeAlertEnabled;
        this.children.get("baro").setReadonly(baroReadonly);

        this.children.get("alert").isReadonly = alertReadonly;
        this.children.get("warn").isReadonly = !this.isAlertOn();

        this.cursorController = new CursorController(this.children);
        //#399: with the baro from the air data and no altitude alerting no field can take the cursor (WARN is read-only
        //while ALERT is off), so the page opens with the cursor off
        if (!baroReadonly || !alertReadonly) {
            this.cursorController.setCursorActive(true);
        }
    }

    public render(): VNode {
        return (<pre>
            &nbspALTITUDE<br/>
            <br ref={this.brRef} class="d-none"/>
            BARO:{this.children.get("baro").render()}<br/>
            ALERT: {this.children.get("alert").render()}<br/>
            <div ref={this.warnRef} className="d-none">
            WARN:±{this.children.get("warn").render()}00ft
            </div>
        </pre>);
    }

    public tick(blink: boolean): void {
        super.tick(blink);

        if (isBaroTransmitted(this.props.planeSettings)) {
            this.children.get("baro").setBaro(this.props.sensors.in.airdata.barometer);
        }
    }

    protected redraw() {
        super.redraw();

        if (this.isAlertOn()) {
            this.brRef.instance.classList.remove("d-none");
            this.warnRef.instance.classList.remove("d-none");
        } else {
            this.brRef.instance.classList.add("d-none");
            this.warnRef.instance.classList.add("d-none");
        }
    }

    private saveBaro(baro: Inhg): void {
        this.props.sensors.in.airdata.barometer = baro;
    }

    /**
     * ALERT ON/OFF is a user setting (#259). 3-57: an installation without altitude alerting shows OFF, whatever was
     * stored while it had it
     */
    private isAlertOn(): boolean {
        return this.props.planeSettings.output.altitudeAlertEnabled && this.props.userSettings.getSetting("altAlertEnabled").get();
    }

    private setAlertEnabled(enabled: number) {
        this.props.userSettings.getSetting("altAlertEnabled").set(enabled === 1);
        this.children.get("warn").isReadonly = !this.isAlertOn();
        this.requiresRedraw = true;
    }

    private setAlertWarn(warn: number) {
        this.props.userSettings.getSetting("altAlertWarn").set((warn + 2) * 100);
    }
}