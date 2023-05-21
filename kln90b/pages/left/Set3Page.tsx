import {FSComponent, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {SelectField} from "../../controls/selects/SelectField";
import {SURFACE_HRD, SURFACE_HRD_SFT} from "../../settings/KLN90BUserSettings";
import {format} from "numerable";


type Set3PageTypes = {
    runwayLength: SelectField,
    runwaySurface: SelectField,
}

/**
 * 3-22
 */
export class Set3Page extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Set3PageTypes>;

    readonly name: string = "SET 3";


    constructor(props: PageProps) {
        super(props);

        const lengthValueSet = [];
        for (let i = 1000; i <= 5000; i += 100) {
            lengthValueSet.push(format(i, "0000"));
        }
        const lengthIndex = (this.props.userSettings.getSetting("nearestAptMinRunwayLength").get() - 1000) / 100;
        const surfaceIndex = this.props.userSettings.getSetting("nearestAptSurface").get() === SURFACE_HRD_SFT ? 0 : 1;


        this.children = new UIElementChildren<Set3PageTypes>({
            runwayLength: new SelectField(lengthValueSet, lengthIndex, this.setMinLength.bind(this)),
            runwaySurface: new SelectField(["    HRD SFT", "        SFT"], surfaceIndex, this.setSurface.bind(this)),
        });

        this.cursorController = new CursorController(this.children);
    }

    public render(): VNode {
        return (<pre>
            NEAREST APT<br/>
            &nbspCRITERIA<br/>
            MIN LENGTH:<br/>
            &nbsp&nbsp&nbsp&nbsp&nbsp&nbsp{this.children.get("runwayLength").render()}'<br/>
            SURFACE<br/>
            {this.children.get("runwaySurface").render()}
        </pre>);
    }

    private setMinLength(lengthIndex: number) {
        const length = lengthIndex * 100 + 1000;

        this.props.userSettings.getSetting("nearestAptMinRunwayLength").set(length);

        // noinspection JSIgnoredPromiseFromCall
        this.props.nearestLists.aptNearestList.updateFilters();
    }

    private setSurface(surfaceIndex: number) {
        this.props.userSettings.getSetting("nearestAptSurface").set(surfaceIndex === 0 ? SURFACE_HRD_SFT : SURFACE_HRD);

        // noinspection JSIgnoredPromiseFromCall
        this.props.nearestLists.aptNearestList.updateFilters();
    }


}