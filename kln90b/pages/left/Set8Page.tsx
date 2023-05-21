import {FSComponent, NodeReference, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {SelectField} from "../../controls/selects/SelectField";
import {AltitudeFieldset} from "../../controls/selects/AltitudeFieldset";


type Set8PageTypes = {
    enable: SelectField;
    vertBuffer: AltitudeFieldset;
}

/**
 * 3-41
 */
export class Set8Page extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Set8PageTypes>;

    readonly name: string = "SET 8";

    protected readonly ref: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();

    constructor(props: PageProps) {
        super(props);


        const enabled = this.props.userSettings.getSetting("airspaceAlertEnabled").get();

        this.children = new UIElementChildren<Set8PageTypes>({
            enable: new SelectField(["DISABLE", " ENABLE"], enabled ? 1 : 0, this.saveEnableAirspaceAlert.bind(this)),
            vertBuffer: new AltitudeFieldset(this.props.userSettings.getSetting("airspaceAlertBuffer").get(), this.saveAirspaceBuffer.bind(this)),

        });

        this.children.get("vertBuffer").setReadonly(!enabled);

        this.cursorController = new CursorController(this.children);
    }

    public render(): VNode {
        return (<pre>
            &nbspAIRSPACE<br/>
            &nbsp&nbspALERT<br/>
            &nbsp{this.children.get("enable").render()}<br/>
            <br/>
            <div ref={this.ref} class="d-none">
                VERT BUFFER<br/>
                &nbsp&nbsp&nbsp±{this.children.get("vertBuffer").render()}ft
            </div>
        </pre>);
    }

    protected redraw() {
        super.redraw();

        const enabled = this.props.userSettings.getSetting("airspaceAlertEnabled").get();

        if (enabled) {
            this.ref.instance.classList.remove("d-none");
        } else {
            this.ref.instance.classList.add("d-none");
        }
    }

    private saveEnableAirspaceAlert(enabled: number): void {
        this.props.userSettings.getSetting("airspaceAlertEnabled").set(enabled === 1);

        this.children.get("vertBuffer").setReadonly(enabled === 0);
        this.requiresRedraw = true;
    }

    private saveAirspaceBuffer(buffer: number): void {
        this.props.userSettings.getSetting("airspaceAlertBuffer").set(buffer);
    }
}