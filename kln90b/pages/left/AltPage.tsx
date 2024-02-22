import {FSComponent, NodeReference, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {BaroFieldset, BaroFieldsetFactory} from "../../controls/selects/BaroFieldset";
import {SelectField} from "../../controls/selects/SelectField";
import {Inhg} from "../../data/Units";


type AltPageTypes = {
    baro: BaroFieldset,
    alert: SelectField,
    warn: SelectField,
}

export class AltPage extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<AltPageTypes>;

    readonly name: string = "     ";

    protected readonly brRef: NodeReference<HTMLBRElement> = FSComponent.createRef<HTMLBRElement>();
    protected readonly warnRef: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();

    constructor(props: PageProps) {
        super(props);


        this.children = new UIElementChildren<AltPageTypes>({
            baro: BaroFieldsetFactory.createBaroFieldSet(this.props.sensors.in.airdata.barometer, this.props.userSettings, this.saveBaro.bind(this)),
            alert: new SelectField([" OFF", "ON ›"], this.props.memory.altPage.alertEnabled ? 1 : 0, this.setAlertEnabled.bind(this)),
            warn: new SelectField(["2", "3", "4", "5", "6", "7", "8", "9"], this.props.memory.altPage.alertWarn / 100 - 2, this.setAlertWarn.bind(this)),
        });

        this.children.get("baro").setReadonly(this.props.planeSettings.input.airdata.baroSource > 0);

        this.children.get("alert").isReadonly = !this.props.planeSettings.output.altitudeAlertEnabled;
        this.children.get("warn").isReadonly = !this.props.memory.altPage.alertEnabled;

        this.cursorController = new CursorController(this.children);
        this.cursorController.setCursorActive(true);
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

        if (this.props.planeSettings.input.airdata.baroSource > 0) {
            this.children.get("baro").setBaro(this.props.sensors.in.airdata.barometer);
        }
    }

    protected redraw() {
        super.redraw();

        const enabled = this.props.memory.altPage.alertEnabled;

        if (enabled) {
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

    private setAlertEnabled(enabled: number) {
        this.props.memory.altPage.alertEnabled = enabled === 1;
        this.children.get("warn").isReadonly = !this.props.memory.altPage.alertEnabled;
        this.requiresRedraw = true;
    }

    private setAlertWarn(warn: number) {
        this.props.memory.altPage.alertWarn = (warn + 2) * 100;
    }
}