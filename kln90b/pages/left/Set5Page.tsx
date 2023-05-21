import {FSComponent, NodeReference, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController, NO_CURSOR_CONTROLLER} from "../CursorController";
import {SelectField} from "../../controls/selects/SelectField";
import {TickController} from "../../TickController";


type Set5PageTypes = {
    enable: SelectField;
    offset: SelectField;
}

/**
 * 3-58
 */
export class Set5Page extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Set5PageTypes>;

    readonly name: string = "SET 5";

    protected readonly ref: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();

    constructor(props: PageProps) {
        super(props);


        const enabled = this.props.userSettings.getSetting("htAboveAptEnabled").get();
        const offset = this.props.userSettings.getSetting("htAboveAptOffset").get();

        this.children = new UIElementChildren<Set5PageTypes>({
            enable: new SelectField(["OFF", " ON"], enabled ? 1 : 0, this.saveEnableHtAlert.bind(this)),
            offset: new SelectField([" 8", " 9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20"], offset / 100 - 8, this.saveHtAlertOffset.bind(this)),

        });

        this.children.get("offset").isReadonly = !enabled;


        if (this.props.planeSettings.output.altitudeAlertEnabled) {
            this.cursorController = new CursorController(this.children);
        } else {
            this.cursorController = NO_CURSOR_CONTROLLER;
        }
    }

    public render(): VNode {
        if (this.props.planeSettings.output.altitudeAlertEnabled) {
            return (<pre>
            &nbspHT ABOVE<br/>
            &nbspAPT ALERT<br/>
            &nbsp&nbsp&nbsp{this.children.get("enable").render()}<br/>
            <br/>
            <div ref={this.ref} class="d-none">
                &nbspAPT ELEV<br/>
                &nbsp&nbsp+{this.children.get("offset").render()}00ft
            </div>
        </pre>);
        } else {
            return (<pre>
            &nbspHT ABOVE<br/>
            &nbspAPT ALERT<br/>
            &nbsp&nbsp&nbspOFF<br/>
            <br/>
            &nbspFEATURE<br/>
            &nbspDISABLED
        </pre>);
        }

    }

    protected redraw() {
        super.redraw();
        if (!TickController.checkRef(this.ref)) {
            return;
        }

        const enabled = this.props.userSettings.getSetting("htAboveAptEnabled").get();

        if (enabled) {
            this.ref.instance.classList.remove("d-none");
        } else {
            this.ref.instance.classList.add("d-none");
        }
    }

    private saveEnableHtAlert(enabled: number): void {
        this.props.userSettings.getSetting("htAboveAptEnabled").set(enabled === 1);

        this.children.get("offset").isReadonly = enabled === 0;
        this.requiresRedraw = true;
    }

    private saveHtAlertOffset(offset: number): void {
        this.props.userSettings.getSetting("airspaceAlertBuffer").set((offset + 8) * 100);
    }
}