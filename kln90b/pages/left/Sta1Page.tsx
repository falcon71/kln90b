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
import {satelliteSnr} from "../../GpsSignal";


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
    /** The SNR of the satellite's true direction (GpsSignal.ts, #464), shown while it is in use */
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
        if (gps.failures.jamming) {
            //#460: the unit still knows the time, the almanac and roughly where it is, and keeps searching the satellites
            //it lost (design, "STA 1 and STA 2")
            return "  ACQ";
        }
        return gps.gpsSatComputer.state === GPSSystemState.Acquiring ? "  ACQ" : " INIT";
    }

    private getRows(): SatRow[] {
        const gps = this.props.sensors.in.gps;
        const failures = gps.failures;
        const byPrn = (a: SatRow, b: SatRow) => a.prn - b.prn;

        if (failures.receiverFailed) {
            return []; //#460: the receiver tracks nothing
        }
        //#460: a satellite jamming blocked is searched and not found (*xx 00), also while the SDK still holds it in a
        //channel until its next position update. A satellite in use loses the jamming level from its SNR
        const jamming = failures.jamming;
        const stateOf = (sat: GPSSatellite): GPSSatelliteState => jamming && failures.isBlocked(sat.prn) ? GPSSatelliteState.None : sat.state.get();
        const snrOf = (sat: GPSSatellite): number => satelliteSnr(sat.position.get()[0]) - failures.jammingDb;

        if (gps.search.mode === SearchMode.Acquisition && !gps.isValid()) {
            //A real-unit video: during ACQ the page lists the satellites predicted for the stored position and the unit's
            //clock, with the predicted elevation (#213). Under jamming a blocked one reads *xx 00 here too (design, "STA 1
            //and STA 2")
            return gps.search.predictedSatellites().map(p => {
                const sat = gps.gpsSatComputer.getSatellites().find(s => s.prn === p.prn);
                return {
                    prn: p.prn,
                    state: sat === undefined ? GPSSatelliteState.None : stateOf(sat),
                    //The signal comes from where the satellite really stands, not from where the unit predicts it
                    snr: sat === undefined ? 0 : snrOf(sat),
                    ele: toElevation(p.position.get()[0]),
                };
            }).sort(byPrn);
        }

        const sats = gps.gpsSatComputer.getChannels().filter(sat => sat !== null) as GPSSatellite[];
        const rows: SatRow[] = sats.slice(0, MAX_ROWS).map(sat => ({
            prn: sat.prn,
            state: stateOf(sat),
            snr: snrOf(sat),
            //A satellite searched blindly has no known position until its orbit data is in (#213)
            ele: gps.isValid() || sat.isCachedEphemerisValid(gps.simTimeUnix) ? toElevation(sat.position.get()[0]) : null,
        }));
        if (jamming) {
            //#460: the receiver keeps searching a satellite it lost while the almanac puts it above the mask (design, "STA
            //1 during an acquisition"): the blocked ones not in a channel, the highest first, in the rows left
            const all = gps.gpsSatComputer.getSatellites();
            const added = failures.jammedRows()
                .filter(prn => !rows.some(r => r.prn === prn))
                .map(prn => all.find(s => s.prn === prn)!)
                .sort((a, b) => a.position.get()[0] - b.position.get()[0])
                .slice(0, Math.max(0, MAX_ROWS - rows.length));
            for (const sat of added) {
                rows.push({prn: sat.prn, state: GPSSatelliteState.None, snr: 0, ele: toElevation(sat.position.get()[0])});
            }
        }
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
                snr = row.snr; //5-29, 5-30, Installation Manual C-7: the curve of an aircraft antenna (#464)
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