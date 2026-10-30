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
import {padInt} from "../../data/NumberFormat";
import {SearchMode} from "../../GpsSearch";


type Sta1PageTypes = {
    line0: TextDisplay,
    line1: TextDisplay,
    line2: TextDisplay,
    line3: TextDisplay,
    line4: TextDisplay,
    line5: TextDisplay,
}

type SatRow = {
    prn: number,
    state: GPSSatelliteState,
    signalStrength: number,
    /** Degrees above the horizon, or null when the receiver does not know where the satellite stands */
    ele: number | null,
};

const toElevation = (zenith: number): number | null => {
    const ele = 90 - UnitType.RADIAN.convertTo(zenith, UnitType.DEGREE);
    return ele >= 0 ? ele : null;
};

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

        this.numPages = this.getRows().length <= 4 ? 1 : 2;
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

        this.numPages = this.getRows().length <= 4 ? 1 : 2;

        super.tick(blink);
    }

    protected redraw(): void {
        const rows = this.getRows();

        if(this.currentPage === 0){
            this.children.get("line0").text = `STATE ${this.stateText(rows)}`;
            this.children.get("line1").text = " SV SNR ELE";
            this.children.get("line2").text = this.drawSat(rows[0]);
            this.children.get("line3").text = this.drawSat(rows[1]);
            this.children.get("line4").text = this.drawSat(rows[2]);
            this.children.get("line5").text = this.drawSat(rows[3]);
        } else {
            //No more than 8
            this.children.get("line0").text = this.drawSat(rows[4]);
            this.children.get("line1").text = this.drawSat(rows[5]);
            this.children.get("line2").text = this.drawSat(rows[6]);
            this.children.get("line3").text = this.drawSat(rows[7]);
            if (this.props.planeSettings.debugMode) {
                this.children.get("line4").text = "ALM:" + (this.props.sensors.in.gps.gpsSatComputer.isAlmanacValid() ? "Y" : "N") + " " + Math.round((this.props.sensors.in.gps.gpsSatComputer as any).almanacProgress * 100);
                const sats = this.props.sensors.in.gps.gpsSatComputer.getChannels().filter(sat => sat !== null) as GPSSatellite[];
                const ttf = Math.max(...sats.map(sat => (sat as any).data.timeToAcquire / 1000).filter(ttf => !Number.isNaN(ttf)));
                this.children.get("line5").text = `TTF:${Math.round(ttf)}`;
            } else {
                this.children.get("line4").text = "";
                this.children.get("line5").text = "";
            }
        }
    }

    private stateText(rows: SatRow[]): string {
        const gps = this.props.sensors.in.gps;
        if (gps.isValid()) {
            if (rows.some(r => r.state === GPSSatelliteState.Acquired)) {
                return "NAV D";
            }
            return this.props.sensors.in.airdata.pressureAltitude === null ? "  NAV" : "NAV A";
        }
        if (gps.isTransition()) {
            return " TRAN";
        }
        switch (gps.search.mode) {
            case SearchMode.Acquisition:
                return "  ACQ";
            case SearchMode.AlmanacSearch:
            case SearchMode.SkySearch:
                return " INIT"; //ORS 20 has no state of its own for a search of the sky (ORS 01 had SRCH)
        }
        return gps.gpsSatComputer.state === GPSSystemState.Acquiring ? "  ACQ" : " INIT";
    }

    private getRows(): SatRow[] {
        const gps = this.props.sensors.in.gps;
        const byPrn = (a: SatRow, b: SatRow) => a.prn - b.prn;

        if (gps.search.mode === SearchMode.Acquisition && !gps.isValid()) {
            //A real-unit video: during ACQ the page lists the satellites predicted for the stored position and the unit's
            //clock, with the predicted elevation (#213)
            return gps.search.predictedSatellites().map(p => {
                const sat = gps.gpsSatComputer.getSatellites().find(s => s.prn === p.prn);
                return {
                    prn: p.prn,
                    state: sat?.state.get() ?? GPSSatelliteState.None,
                    signalStrength: sat?.signalStrength.get() ?? 0,
                    ele: toElevation(p.position.get()[0]),
                };
            }).sort(byPrn);
        }

        const sats = gps.gpsSatComputer.getChannels().filter(sat => sat !== null) as GPSSatellite[];
        return sats.map(sat => ({
            prn: sat.prn,
            state: sat.state.get(),
            signalStrength: sat.signalStrength.get(),
            //A satellite searched blindly has no known position until its orbit data is in (#213)
            ele: gps.isValid() || sat.isCachedEphemerisValid(gps.simTimeUnix) ? toElevation(sat.position.get()[0]) : null,
        })).sort(byPrn);
    }

    private drawSat(row: SatRow | undefined): string{
        if(row === undefined){
            return " ";
        }
        const state = row.state;
        const sv = row.prn;
        let used: string;
        let health: string;
        let snr: number;
        const ele = row.ele === null ? "--" : padInt(row.ele, 2);
        switch (state) {
            case GPSSatelliteState.InUse:
            case GPSSatelliteState.InUseDiffApplied:
                used = ' ';
                health = ' ';
                snr = 35 + row.signalStrength * 20; //5-30: Values range 35 to 55
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
        return `${used}${padInt(sv, 2)}${health} ${padInt(snr, 2)} ${ele}°`;
    }
}