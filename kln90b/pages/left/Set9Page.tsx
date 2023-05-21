import {FSComponent, NodeReference, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController, NO_CURSOR_CONTROLLER} from "../CursorController";
import {VolumeFieldset} from "../../controls/selects/VolumeFieldset";


type Set9PageTypes = {
    volume: VolumeFieldset;
}

/**
 * 3-57
 */
export class Set9Page extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Set9PageTypes>;

    readonly name: string = "SET 7";

    protected readonly ref: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();

    constructor(props: PageProps) {
        super(props);


        const volume = this.props.userSettings.getSetting("altAlertVolume").get();

        this.children = new UIElementChildren<Set9PageTypes>({
            volume: new VolumeFieldset(volume, this.saveVolume.bind(this)),
        });

        if (this.props.planeSettings.output.altitudeAlertEnabled) {
            this.cursorController = new CursorController(this.children);
        } else {
            this.cursorController = NO_CURSOR_CONTROLLER;
        }

    }

    public render(): VNode {
        if (this.props.planeSettings.output.altitudeAlertEnabled) {
            return (<pre>
                ALTITUDE<br/>
                &nbsp&nbspALERT<br/>
                &nbspVOLUME:<br/>
                <br/>
                &nbsp&nbsp&nbsp&nbsp{this.children.get("volume").render()}
            </pre>);
        } else {
            return (<pre>
                ALTITUDE<br/>
                &nbsp&nbspALERT<br/>
                &nbspVOLUME<br/>
                &nbsp&nbsp&nbspOFF<br/>
                &nbspFEATURE<br/>
                &nbspDISABLED
            </pre>);
        }
    }

    private saveVolume(volume: number): void {
        this.props.userSettings.getSetting("altAlertVolume").set(volume);
    }

}