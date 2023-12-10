import {FSComponent, NodeReference, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {SelectField} from "../../controls/selects/SelectField";


type Set10PageTypes = {
    fastGps: SelectField;
}

/**
 * 3-57
 */
export class Set10Page extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Set10PageTypes>;

    readonly name: string = "SET10";

    protected readonly ref: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();

    constructor(props: PageProps) {
        super(props);


        const fastGpsAcquisition = this.props.userSettings.getSetting("fastGpsAcquisition").get();

        this.children = new UIElementChildren<Set10PageTypes>({
            fastGps: new SelectField(['REAL', 'FAST'], fastGpsAcquisition ? 1 : 0, this.saveFastGpsAcquisition.bind(this)),
        });

        this.cursorController = new CursorController(this.children);

    }

    public render(): VNode {
        return (<pre>
                GPS:&nbsp&nbsp&nbsp{this.children.get("fastGps").render()}
            </pre>);
    }

    private saveFastGpsAcquisition(fastGpsAcquisition: number): void {
        this.props.userSettings.getSetting("fastGpsAcquisition").set(fastGpsAcquisition === 1);
        if (fastGpsAcquisition === 1) {
            this.props.sensors.in.gps.gpsSatComputer.acquireAndUseSatellites();
        }
    }

}