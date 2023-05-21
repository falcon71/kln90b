import {PageProps, UiElement, UIElementChildren} from "../pages/Page";
import {SelectField} from "./selects/SelectField";
import {FSComponent, NodeReference, UserSetting, VNode} from "@microsoft/msfs-sdk";
import {Nav5Orientation, SuperNav5VOR} from "../settings/KLN90BUserSettings";
import {KLN90PlaneSettings} from "../settings/KLN90BPlaneSettings";
import {BearingDisplay} from "./displays/BearingDisplay";
import {Degrees} from "../data/Units";
import {CursorController} from "../pages/CursorController";

type SuperNav5RightTypes = {
    vor: SelectField,
    ndb: SelectField,
    apt: SelectField,
    orientationValue: BearingDisplay,
    orientation: SelectField,
}

export class SuperNav5Right implements UiElement {
    public readonly children: UIElementChildren<SuperNav5RightTypes>;
    protected readonly ref: NodeReference<HTMLPreElement> = FSComponent.createRef<HTMLPreElement>();
    private orientationSetting: UserSetting<Nav5Orientation>;

    constructor(private props: PageProps, private cursorController: CursorController) {

        this.orientationSetting = this.props.userSettings.getSetting("superNav5MapOrientation");
        this.children = new UIElementChildren<SuperNav5RightTypes>({
            vor: new SelectField(["OFF", "  H", " LH", "TLH"], this.props.userSettings.getSetting("superNav5Vor").get(), this.saveVor.bind(this)),
            ndb: new SelectField(["OFF", " ON"], this.props.userSettings.getSetting("superNav5Ndb").get() ? 1 : 0, this.saveNdb.bind(this)),
            apt: new SelectField(["OFF", " ON"], this.props.userSettings.getSetting("superNav5Apt").get() ? 1 : 0, this.saveApt.bind(this)),
            orientationValue: new BearingDisplay(this.getOrientationValue()),
            orientation: new SelectField(this.getOrientationValueset(props.planeSettings), this.orientationSetting.get(), this.saveMapOrientation.bind(this)),

        });
    }

    public render(): VNode {
        return (<pre ref={this.ref} class="super-nav5-right-controls d-none">
            ÜVOR:{this.children.get("vor").render()}<br/>
            ÝNDB:{this.children.get("ndb").render()}<br/>
            ŸAPT:{this.children.get("apt").render()}<br/>
            &nbsp{this.children.get("orientationValue").render()}{this.children.get("orientation").render()}<br/>
        </pre>);
    }

    public tick(blink: boolean): void {
        this.children.get("orientationValue").bearing = this.getOrientationValue();
        if (this.cursorController.cursorActive) {
            this.ref.instance.classList.remove("d-none");
        } else {
            this.ref.instance.classList.add("d-none");
        }
    }

    private getOrientationValue(): Degrees | null {
        switch (this.orientationSetting.get()) {
            case Nav5Orientation.NORTH_UP:
                return 0;
            case Nav5Orientation.DTK_UP:
                return this.props.modeController.getDtkOrObsMagnetic();
            case Nav5Orientation.TK_UP:
                return this.props.magvar.trueToMag(this.props.sensors.in.gps.getTrackTrueRespectingGroundspeed());
            case Nav5Orientation.HDG_UP:
                return this.props.sensors.in.headingGyro;
        }
    }

    private getOrientationValueset(options: KLN90PlaneSettings): string[] {
        return options.input.headingInput ? [" N^", "Ó^", "Ö^", "Ú^"] : [" N^", "Ó^", "Ö^"];
    }

    private saveVor(vor: SuperNav5VOR): void {
        this.props.userSettings.getSetting("superNav5Vor").set(vor);
    }

    private saveNdb(ndb: number): void {
        this.props.userSettings.getSetting("superNav5Ndb").set(ndb === 1);
    }

    private saveApt(apt: number): void {
        this.props.userSettings.getSetting("superNav5Apt").set(apt === 1);
    }

    private saveMapOrientation(orientation: Nav5Orientation): void {
        this.props.userSettings.getSetting("superNav5MapOrientation").set(orientation);
    }


}