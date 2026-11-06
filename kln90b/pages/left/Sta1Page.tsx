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
import {Raim, raimStatus} from "../../GpsSolution";
import {halForMode} from "../../services/ModeController";
import {MASK_ZENITH_RAD} from "../../GpsSignal";


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
    /** The SNR of the last calculation tick (GpsSignal.ts, #464, #467), shown while the satellite is in use */
    snr: number,
    /** Degrees above the horizon, or null when the receiver does not know where the satellite stands */
    ele: number | null,
};

/** The rows of both pages: four each (5-29) */
const MAX_ROWS = 8;

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
        //5-29: the second page goes with the fifth satellite; a unit on it falls back to the first page (#466)
        if (this.currentPage >= this.numPages) {
            this.currentPage = this.numPages - 1;
        }

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
            //The photo of a real unit shows the header on this page too, although the Pilot's Guide (5-29) and the ORS 1
            //manual show none. The four satellites follow it
            this.children.get("line0").text = " SV SNR ELE";
            //No more than 8
            this.children.get("line1").text = this.drawSat(rows[4]);
            this.children.get("line2").text = this.drawSat(rows[5]);
            this.children.get("line3").text = this.drawSat(rows[6]);
            this.children.get("line4").text = this.drawSat(rows[7]);
            if (this.props.planeSettings.debugMode) {
                //Only one line is left, so the almanac and the time to fix share it
                const sats = this.props.sensors.in.gps.gpsSatComputer.getChannels().filter(sat => sat !== null) as GPSSatellite[];
                const ttf = Math.max(...sats.map(sat => (sat as any).data.timeToAcquire / 1000).filter(ttf => !Number.isNaN(ttf)));
                this.children.get("line5").text = `A:${this.props.sensors.in.gps.gpsSatComputer.isAlmanacValid() ? "Y" : "N"}${Math.round((this.props.sensors.in.gps.gpsSatComputer as any).almanacProgress * 100)} T:${Math.round(ttf)}`;
            } else {
                this.children.get("line5").text = "";
            }
        }
    }

    private stateText(rows: SatRow[]): string {
        const gps = this.props.sensors.in.gps;
        //#460: a dead antenna or receiver (Installation Manual C-7), before every other state
        if (gps.failures.receiverFailed) {
            return "FAILR";
        }
        if (gps.isValid()) {
            const solution = gps.solution;
            //5-29: DEGRD is shown when the satellite geometry is too poor for RAIM. The condition is the spec's
            //low-confidence call (design of #453, 5.3): RAIM available in principle (enough measurements) but the
            //protection level of the geometry exceeds the alert limit of the flight phase. With too few measurements
            //there is no RAIM to degrade, and the state stays NAV
            if (raimStatus(solution, halForMode(this.props.memory.navPage.navmode)) === Raim.Geometry) {
                return "DEGRD";
            }
            if (rows.some(r => r.state === GPSSatelliteState.Acquired)) {
                return "NAV D";
            }
            //5-29: NAV A is a solution that uses the altitude input as a measurement (three satellites plus altitude, or
            //four and more with it)
            return solution.altitudeAided ? "NAV A" : "  NAV";
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
        if (this.searchesLostSatellite()) {
            //#467: the receiver lost the signal of a satellite it has in a channel, whatever the cause (jamming, the
            //antenna's tilt, a fade). It still knows the time, the almanac and roughly where it is, and searches it
            return "  ACQ";
        }
        return gps.gpsSatComputer.state === GPSSystemState.Acquiring ? "  ACQ" : " INIT";
    }

    /** A satellite in a channel whose signal the receiver lost, above the 5 degree mask (5-30) */
    private searchesLostSatellite(): boolean {
        const gps = this.props.sensors.in.gps;
        const channels = gps.gpsSatComputer.getChannels();
        for (let i = 0; i < channels.length; i++) {
            const sat = channels[i];
            if (sat !== null && gps.signals.isLost(sat.prn) && sat.position.get()[0] < MASK_ZENITH_RAD) {
                return true;
            }
        }
        return false;
    }

    private getRows(): SatRow[] {
        const gps = this.props.sensors.in.gps;
        const byPrn = (a: SatRow, b: SatRow) => a.prn - b.prn;

        if (gps.failures.receiverFailed) {
            return []; //#460: the receiver tracks nothing
        }
        //#467: a satellite whose signal the receiver lost stays in its channel and is searched, not found: the SDK's own
        //None state, which reads *xx 00 (5-30)

        if (gps.search.mode === SearchMode.Acquisition && !gps.isValid()) {
            //A real-unit video: during ACQ the page lists the satellites predicted for the stored position and the unit's
            //clock, with the predicted elevation (#213)
            return gps.search.predictedSatellites().map(p => {
                const sat = gps.gpsSatComputer.getSatellites().find(s => s.prn === p.prn);
                return {
                    prn: p.prn,
                    state: sat === undefined ? GPSSatelliteState.None : sat.state.get(),
                    //The signal comes from where the satellite really stands, not from where the unit predicts it
                    snr: sat === undefined ? 0 : gps.signals.snr(sat.prn),
                    ele: toElevation(p.position.get()[0]),
                };
            }).sort(byPrn);
        }

        const sats = gps.gpsSatComputer.getChannels().filter(sat => sat !== null) as GPSSatellite[];
        const rows: SatRow[] = sats.slice(0, MAX_ROWS).map(sat => ({
            prn: sat.prn,
            state: sat.state.get(),
            snr: gps.signals.snr(sat.prn),
            //A satellite searched blindly has no known position until its orbit data is in (#213)
            ele: gps.isValid() || sat.isCachedEphemerisValid(gps.simTimeUnix) ? toElevation(sat.position.get()[0]) : null,
        }));
        return rows.sort(byPrn);
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
                snr = row.snr; //5-29, 5-30, Installation Manual C-7: the receiver's own SNR estimate (#464, #467)
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