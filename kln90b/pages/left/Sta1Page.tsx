import {
    FSComponent,
    GPSSatellite,
    GPSSatelliteState,
    GPSSystemState,
    NodeReference,
    UnitType,
    VNode,
} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {NO_CURSOR_CONTROLLER} from "../CursorController";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {format} from "numerable";


type Sta1PageTypes = {
    line0: TextDisplay,
    line1: TextDisplay,
    line2: TextDisplay,
    line3: TextDisplay,
    line4: TextDisplay,
    line5: TextDisplay,
}

/**
 * 5-29
 */
export class Sta1Page extends SixLineHalfPage {

    public readonly cursorController = NO_CURSOR_CONTROLLER;
    readonly children: UIElementChildren<Sta1PageTypes> = new UIElementChildren<Sta1PageTypes>({
        line0: new TextDisplay("STATE"),
        line1: new TextDisplay(""),
        line2: new TextDisplay(""),
        line3: new TextDisplay(""),
        line4: new TextDisplay(""),
        line5: new TextDisplay(""),
    });

    readonly name: string = "STA 1";

    protected readonly ref: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();


    constructor(props: PageProps) {
        super(props);

        this.numPages = this.getSats().length <= 4 ? 1 : 2;
    }

    public render(): VNode {
        return (<pre>
                {this.children.get("line0").render()}<br/>
            {this.children.get("line1").render()}<br/>
            {this.children.get("line2").render()}<br/>
            {this.children.get("line3").render()}<br/>
            {this.children.get("line4").render()}<br/>
            {this.children.get("line5").render()}
        </pre>);
    }

    public tick(blink: boolean): void {
        this.requiresRedraw = true;

        this.numPages = this.getSats().length <= 4 ? 1 : 2;

        super.tick(blink);
    }

    protected redraw(): void {
        const sats = this.getSats();

        if(this.currentPage === 0){
            let state: string;
            switch (this.props.sensors.in.gps.gpsSatComputer.state) {
                case GPSSystemState.Searching:
                    state = " INIT";
                    break;
                case GPSSystemState.Acquiring:
                    state = "  ACQ";
                    break;
                case GPSSystemState.SolutionAcquired:
                case GPSSystemState.DiffSolutionAcquired:
                    const dataCollection = sats.filter(sat => sat.state.get() === GPSSatelliteState.Acquired).length > 0;
                    if(dataCollection){
                        state = "NAV D";
                    }else if (this.props.sensors.in.airdata.pressureAltitude === null) {
                        state = "  NAV";
                    } else {
                        state = "NAV A";
                    }
                    break;
            }
            this.children.get("line0").text = `STATE ${state}`;
            this.children.get("line1").text = " SV SNR ELE";
            this.children.get("line2").text = this.drawSat(sats[0]);
            this.children.get("line3").text = this.drawSat(sats[1]);
            this.children.get("line4").text = this.drawSat(sats[2]);
            this.children.get("line5").text = this.drawSat(sats[3]);
        } else {
            //No more than 8
            this.children.get("line0").text = this.drawSat(sats[4]);
            this.children.get("line1").text = this.drawSat(sats[5]);
            this.children.get("line2").text = this.drawSat(sats[6]);
            this.children.get("line3").text = this.drawSat(sats[7]);
            if (this.props.planeSettings.debugMode) {
                this.children.get("line4").text = "ALM:" + (this.props.sensors.in.gps.gpsSatComputer.isAlmanacValid() ? "Y" : "N") + " " + Math.round((this.props.sensors.in.gps.gpsSatComputer as any).almanacProgress * 100);
                const ttf = Math.max(...sats.map(sat => (sat as any).timeToAcquire / 1000).filter(ttf => !Number.isNaN(ttf)));
                this.children.get("line5").text = `TTF:${Math.round(ttf)}`;
            } else {
                this.children.get("line4").text = "";
                this.children.get("line5").text = "";
            }
        }
    }

    private getSats(): GPSSatellite[]{
        const notNullSats = this.props.sensors.in.gps.gpsSatComputer.getChannels()
            .filter(sat => sat !== null) as GPSSatellite[];
        return notNullSats.sort((a, b) => a.prn - b.prn);
    }

    private drawSat(sat: GPSSatellite | undefined): string{
        if(sat === undefined){
            return " ";
        }
        const state = sat.state.get();
        const sv = sat.prn;
        let used: string;
        let health: string;
        let snr: number;
        const ele = Math.abs(90 - UnitType.RADIAN.convertTo(sat.position.get()[0], UnitType.DEGREE)); //[0] is zenith angle, we display elevation
        switch (state) {
            case GPSSatelliteState.InUse:
            case GPSSatelliteState.InUseDiffApplied:
                used = ' ';
                health = ' ';
                snr = 35 + sat.signalStrength.get() * 20; //5-30: Values range 35 to 55
                break;
            case GPSSatelliteState.Unreachable:
                used = '*';
                health = '-';
                snr = 0;
                break;
            case GPSSatelliteState.Faulty:
                used = '*';
                health = 'B';
                snr = 0;
                break;
            case GPSSatelliteState.None:
            case GPSSatelliteState.Acquired:
            case GPSSatelliteState.DataCollected:
                used = '*';
                health = ' ';
                snr = 0; // https://youtu.be/8esFTk7Noj8?t=62
                break;

        }
        return `${used}${format(sv, "00")}${health} ${format(snr, "00")} ${format(ele, "00")}°`;
    }
}