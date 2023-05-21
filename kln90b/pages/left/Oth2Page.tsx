import {BitFlags, BoundaryFacility, BoundaryType, FacilityFrequency, FSComponent, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {NO_CURSOR_CONTROLLER} from "../CursorController";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {format} from "numerable";


type Oth2PageTypes = {
    line1: TextDisplay,
    line2: TextDisplay,
    freq0: TextDisplay,
    freq1: TextDisplay,
    freq2: TextDisplay,
    freq3: TextDisplay,
}


export class Oth2Page extends SixLineHalfPage {

    public readonly cursorController = NO_CURSOR_CONTROLLER;
    readonly children: UIElementChildren<Oth2PageTypes>;

    readonly name: string = "OTH 2";

    private centers: FacilityFrequency[] = [];

    constructor(props: PageProps) {
        super(props);

        this.children = new UIElementChildren<Oth2PageTypes>({
            line1: new TextDisplay("OUTSIDE"), // Example here https://youtu.be/gjmVrkHTdP0?t=50
            line2: new TextDisplay("ARTCC"),
            freq0: new TextDisplay(""),
            freq1: new TextDisplay(""),
            freq2: new TextDisplay(""),
            freq3: new TextDisplay(""),
        });
        this.loadCenter();
    }


    public render(): VNode {
        return (<pre>
            {this.children.get("line1").render()}<br/>
            {this.children.get("line2").render()}<br/>
            &nbsp&nbsp&nbsp&nbsp&nbsp{this.children.get("freq0").render()}<br/>
            &nbsp&nbsp&nbsp&nbsp&nbsp{this.children.get("freq1").render()}<br/>
            &nbsp&nbsp&nbsp&nbsp&nbsp{this.children.get("freq2").render()}<br/>
            &nbsp&nbsp&nbsp&nbsp&nbsp{this.children.get("freq3").render()}
        </pre>);
    }

    protected redraw() {
        if (this.centers.length === 0) {
            this.children.get("line1").text = "OUTSIDE";
            this.children.get("line2").text = "ARTCC";
            this.children.get("freq0").text = "";
            this.children.get("freq1").text = "";
            this.children.get("freq2").text = "";
            this.children.get("freq3").text = "";
        } else {
            this.children.get("line1").text = this.centers[0].name.substring(0, 11);
            this.children.get("line2").text = "CTR";
            this.children.get("freq0").text = this.getFrequncyTextAtIndex(0);
            this.children.get("freq1").text = this.getFrequncyTextAtIndex(1);
            this.children.get("freq2").text = this.getFrequncyTextAtIndex(2);
            this.children.get("freq3").text = this.getFrequncyTextAtIndex(3);
        }
    }

    private loadCenter() {
        this.props.nearestUtils.getAirspaces(this.props.sensors.in.gps.coords.lat, this.props.sensors.in.gps.coords.lon, 0, 20, BitFlags.createFlag(BoundaryType.Center)).then(
            centers => {
                //todo need to test if this is actually working. We currently assume, that all boundaries are the same center
                console.log("OTH2", centers);
                this.centers = [];
                for (const center of centers) {
                    const freq = this.getFrequency(center.facility);
                    //There are actually some duplicate frequencies
                    if (this.centers.findIndex(c => c.freqMHz === freq.freqMHz) === -1) {
                        this.centers.push(freq);
                    }
                }

                this.centers.sort((a, b) => a.freqMHz - b.freqMHz);
                this.requiresRedraw = true;
            },
        )
    }

    private getFrequncyTextAtIndex(i: number): string {
        if (i >= this.centers.length) {
            return "";
        }
        return format(this.centers[i].freqMHz, "000.00");
    }

    /**
     * This field somehow seems to be missing
     * @param center
     * @private
     */
    private getFrequency(center: BoundaryFacility): FacilityFrequency {
        // @ts-ignore
        return center.frequency;
    }

}