import {BitFlags, BoundaryFacility, BoundaryType, FacilityFrequency, FSComponent, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {NO_CURSOR_CONTROLLER} from "../CursorController";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {padFixed} from "../../data/NumberFormat";
import {TICK_TIME_DISPLAY} from "../../TickController";
import {ErrorEvent} from "../../controls/ErrorPage";


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
    private ticksToSearch = 0;
    private isSearching = false;

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

    tick(blink: boolean) {
        //#251, 3-52: the Center of the present position is looked up again every 10 s while the page is shown, one
        //search at a time, as NAV 2 does with its VOR
        this.ticksToSearch--;
        if (this.ticksToSearch <= 0 && !this.isSearching) {
            this.loadCenter();
        }
        super.tick(blink);
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
        this.ticksToSearch = 10000 / TICK_TIME_DISPLAY;
        this.isSearching = true;
        this.props.nearestUtils.getAirspacesAt(this.props.sensors.in.gps.coords.lat, this.props.sensors.in.gps.coords.lon, 20, BitFlags.createFlag(BoundaryType.Center)).then(
            centers => {
                //The flag clears even when the body throws, or the page would never search again
                try {
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
                } finally {
                    this.isSearching = false;
                }
            },
            e => {
                //A failed search keeps the Center on screen, shows on the error page, as one of a nearest list does (#95),
                //and the next one runs
                this.isSearching = false;
                console.error(e);
                if (e instanceof Error) {
                    this.props.bus.getPublisher<ErrorEvent>().pub("error", e);
                }
            },
        );
    }

    private getFrequncyTextAtIndex(i: number): string {
        if (i >= this.centers.length) {
            return "";
        }
        return padFixed(this.centers[i].freqMHz, 3, 2);
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