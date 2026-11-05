import {SimVarValueType} from "@microsoft/msfs-sdk";
import {DataInterface, KLN90PlaneSettings, ObsInterface, RmiInterface} from "./settings/KLN90BPlaneSettings";
import {CommandedSignal, FailedInputPort, FailedOutputPort, Lamp} from "./failures/FailureCatalog";

//The physical interfaces of the unit, one object each, after the interconnect drawing (Installation manual 006-10521-0005
//Rev 5, figure 2-17, 2-45 to 2-57) (#451). Every SimVar the unit reads or writes for an input or an output goes through
//the port of the interface the real unit uses for it, so the code says which SimVars an interface carries. The failure
//simulation (#458) fails a port: a failed output stops writing, a failed input reports it is not receiving. A failed
//output writes its null state once, in a null-state pass (Interconnect.writeNullState).
//The "Real unit:" comments at the call sites explain the value; the comments here explain the wire.

/**
 * One physical output of the unit
 */
export interface OutputPort {
    readonly name: string;
    /**
     * False while nothing leaves this interface: a failure of the part is effective (#458)
     */
    readonly isTransmitting: boolean;

    write(simVar: string, unit: SimVarValueType | string, value: number | boolean | string): void;
}

/**
 * One physical input of the unit
 */
export interface InputPort {
    readonly name: string;
    /**
     * False while nothing arrives on this interface: a failure of the part is effective (#458). Readers check it once
     * per tick, not per SimVar
     */
    readonly isReceiving: boolean;

    read(simVar: string, unit: SimVarValueType | string): any;
}

/**
 * Which failures the ports ask about (Failures, #458)
 */
export interface PortFailureSource {
    isOutputFailed(port: FailedOutputPort): boolean;

    isInputFailed(port: FailedInputPort): boolean;

    /** What the lamp does regardless of the command (#459) */
    lampFault(lamp: Lamp): 'dark' | 'stuck' | null;
}

/**
 * Nothing ever fails
 */
export const NO_FAILURES: PortFailureSource = {
    isOutputFailed: () => false,
    isInputFailed: () => false,
    lampFault: () => null,
};

/**
 * Which signals the unit commanded on and off since the failure detector last looked (#459). A short pulse between two
 * 1 Hz checks would otherwise be missed
 */
export class CommandedSignals {
    private readonly flags = new Map<CommandedSignal, {on: boolean, off: boolean}>();

    public record(signal: CommandedSignal, on: boolean): void {
        this.flagsOf(signal)[on ? 'on' : 'off'] = true;
    }

    /** True when the signal was commanded that way since the last take of that pair; clears it */
    public take(signal: CommandedSignal, on: boolean): boolean {
        const flags = this.flagsOf(signal);
        const key = on ? 'on' : 'off';
        const was = flags[key];
        flags[key] = false;
        return was;
    }

    public clear(): void {
        this.flags.forEach(flags => {
            flags.on = false;
            flags.off = false;
        });
    }

    /** Created once per signal, so a port write allocates nothing after the first */
    private flagsOf(signal: CommandedSignal): {on: boolean, off: boolean} {
        let flags = this.flags.get(signal);
        if (flags === undefined) {
            flags = {on: false, off: false};
            this.flags.set(signal, flags);
        }
        return flags;
    }
}

/**
 * The null-state pass of an Interconnect (#458). Outside a pass a port writes while it transmits. Inside one, the ports
 * it lists write whether they failed or not, and every other port drops its writes. JS is single-threaded and the pass
 * is synchronous, so one field is enough
 */
export class NullStatePass {
    private ports: readonly OutputPort[] | 'all' | null = null;

    public lists(port: OutputPort): boolean {
        return this.ports === 'all' || (this.ports !== null && this.ports.includes(port));
    }

    public mayWrite(port: OutputPort): boolean {
        return this.ports === null ? port.isTransmitting : this.lists(port);
    }

    /** True inside a pass, whichever ports it lists */
    public isRunning(): boolean {
        return this.ports !== null;
    }

    public run(ports: readonly OutputPort[] | 'all', write: () => void): void {
        const outer = this.ports;
        this.ports = ports;
        try {
            write();
        } finally {
            this.ports = outer;
        }
    }
}

export class SimVarOutput implements OutputPort {
    /**
     * @param name The name of the interface
     * @param isFailed Whether a failure of the part is effective; never, for a port no failure takes
     * @param pass The null-state pass of the Interconnect the port belongs to
     */
    constructor(public readonly name: string, private readonly isFailed: () => boolean = () => false,
                protected readonly pass: NullStatePass = new NullStatePass()) {
    }

    public get isTransmitting(): boolean {
        return !this.isFailed();
    }

    public write(simVar: string, unit: SimVarValueType | string, value: number | boolean | string): void {
        if (this.pass.mayWrite(this)) {
            SimVar.SetSimVarValue(simVar, unit, value);
        }
    }
}

/**
 * A remote lamp output, P901 pin 14 WPT or 15 MSG (#459). Outside a null-state pass it writes what the lamp does: false
 * for a dark lamp (a burnt bulb, or a short that bypasses it), true for a stuck driver, the commanded value otherwise,
 * and it records what the unit commanded for the failure detector. Inside a pass it writes the value it gets and records
 * nothing: the stuck driver is the sense regulator's loop failing to reach zero, and that loop runs on the unit's own
 * supply, so the power change's pass leaves the lamp dark (docs/failures.md, "Annunciators"; CMM 25-26)
 */
export class LampOutput extends SimVarOutput {
    constructor(name: string, private readonly lamp: Lamp, private readonly failures: PortFailureSource,
                private readonly commanded: CommandedSignals, pass: NullStatePass) {
        super(name, undefined, pass);
    }

    public write(simVar: string, unit: SimVarValueType | string, value: number | boolean | string): void {
        if (this.pass.isRunning()) {
            super.write(simVar, unit, value);
            return;
        }
        this.commanded.record(this.lamp, !!value);
        const fault = this.failures.lampFault(this.lamp);
        super.write(simVar, unit, fault === null ? value : fault === 'stuck');
    }
}

export class SimVarInput implements InputPort {
    /**
     * @param name The name of the interface
     * @param isFailed Whether a failure of the part is effective; never, for a port no failure takes
     */
    constructor(public readonly name: string, private readonly isFailed: () => boolean = () => false) {
    }

    /**
     * False while a failure of the part is effective (#458). read() does not look: the readers ask once per tick and
     * treat the value as missing
     */
    public get isReceiving(): boolean {
        return !this.isFailed();
    }

    public read(simVar: string, unit: SimVarValueType | string): any {
        return SimVar.GetSimVarValue(simVar, unit);
    }
}

/**
 * Where a write goes that must not reach the sim: the GPS SimVars without Output.WriteGPSSimVars. It drops every write,
 * in a null-state pass too
 */
export const NULL_OUTPUT: OutputPort = {
    name: "none",
    isTransmitting: false,
    write(): void {
    },
};

/** The bits of GPS APPROACH MODE for the ARM and the ACTV lamp */
const ARM_BIT = 1;
const ACTV_BIT = 2;

/**
 * GPS APPROACH MODE lights the ARM lamp (1) and the ACTV lamp (2), and both on the self-test (3); it is the SimVar the wiki
 * documents for the lamps of the GPS APR switch-annunciator, so it stays one SimVar over two outputs. For a failed lamp
 * (#459) the group changes the value instead of dropping the write, so the lamp that works keeps working: a dark ARM
 * clears bit 1 (1 → 0, 3 → 2), a dark ACTV clears bit 2 (2 → 0, 3 → 1), a stuck ARM sets bit 1, a stuck ACTV sets bit 2.
 * It records the commanded bits as the lamp ports do (LampOutput), and inside a null-state pass it passes the value
 * through and records nothing (docs/failures.md, "Annunciators")
 */
export class ApproachLampGroup implements OutputPort {
    public readonly name = "Approach lamps";

    constructor(private readonly arm: OutputPort, private readonly actv: OutputPort,
                private readonly failures: PortFailureSource, private readonly commanded: CommandedSignals,
                private readonly pass: NullStatePass) {
    }

    public get isTransmitting(): boolean {
        return this.arm.isTransmitting || this.actv.isTransmitting;
    }

    /**
     * By the rule of its lamps: it writes while one of them may write, outside a pass or in a pass that lists it
     */
    public write(simVar: string, unit: SimVarValueType | string, value: number | boolean | string): void {
        if (!this.pass.mayWrite(this.arm) && !this.pass.mayWrite(this.actv)) {
            return;
        }
        if (this.pass.isRunning()) {
            SimVar.SetSimVarValue(simVar, unit, value);
            return;
        }
        const mode = Number(value);
        this.commanded.record('arm', (mode & ARM_BIT) !== 0);
        this.commanded.record('actv', (mode & ACTV_BIT) !== 0);
        SimVar.SetSimVarValue(simVar, unit, ApproachLampGroup.lampBit(ApproachLampGroup.lampBit(mode, ARM_BIT, this.failures.lampFault('arm')),
            ACTV_BIT, this.failures.lampFault('actv')));
    }

    private static lampBit(mode: number, bit: number, fault: 'dark' | 'stuck' | null): number {
        switch (fault) {
            case 'dark':
                return mode & ~bit;
            case 'stuck':
                return mode | bit;
            default:
                return mode;
        }
    }
}

/**
 * The unit's wiring: the ports, and which port a device is wired to.
 *
 * The device getters (navData, rmi, airdata, obs, heading) read the settings on every access. SimVarSync writes the
 * runtime overrides of panel.xml keys into the settings object (L:KLN90B_WriteGpsSimvars today), so an interface switched
 * at runtime takes effect at the next write. That holds only while no consumer stores what a getter returned: keep the
 * Interconnect and ask it at the moment of the access
 */
export class Interconnect {

    private readonly pass = new NullStatePass();

    /** What the unit commanded on and off, for the failure detector (#459) */
    public readonly commanded = new CommandedSignals();

    //##############
    //###Outputs####
    //##############

    /**
     * P901 pins 23 (A) and 24 (B), ARINC 429 low speed, GAMA format. Labels in the Installation manual 1-3, 1-4
     */
    public readonly arinc429Tx: OutputPort = new SimVarOutput("ARINC 429 TX", () => this.failures.isOutputFailed('arinc429Tx'), this.pass);
    /**
     * P901 pin 13 RS-232 OUT, 9600 baud 8N1, items in the Installation manual A-1 to A-9. It can drive several inputs
     */
    public readonly rs232Out: OutputPort = new SimVarOutput("RS-232 OUT", () => this.failures.isOutputFailed('rs232Out'), this.pass);
    /**
     * The CDI/HSI outputs: P901 pin 22 +RIGHT against pin 25 +LEFT/NAV FLAG- (deviation), pin 21 +TO against pin 20 +FROM,
     * pin 19 NAV FLAG+ against pin 25 (Installation manual 1-7, 1-8, 2-5). The superflag is a port of its own
     */
    public readonly analogNav: OutputPort = new SimVarOutput("Analog nav", undefined, this.pass);
    /**
     * P901 pins 10 OBI DATA, 11 OBI CLOCK, 12 OBI SYNC, the Honeywell serial bus for an RMI, or a sin/cos OBI through a
     * KDA 692 (Installation manual 1-7, 2-4)
     */
    public readonly obiBus: OutputPort = new SimVarOutput("OBI", () => this.failures.isOutputFailed('obiBus'), this.pass);
    /**
     * P901 pin 14 WPT ALERT, pulled low to light a remote lamp (Installation manual 1-7, 2-5)
     */
    public readonly wptAnnunciator: OutputPort = new LampOutput("WPT annunciator", 'wpt', this.failures, this.commanded, this.pass);
    /**
     * P901 pin 15 MSG, pulled low to light a remote lamp (Installation manual 1-7, 2-5)
     */
    public readonly msgAnnunciator: OutputPort = new LampOutput("MSG annunciator", 'msg', this.failures, this.commanded, this.pass);
    /**
     * P901 pin 16 APPROACH ACTIVE, pulled low to light the ACTV lamp of the GPS APR switch-annunciator (Installation
     * manual 1-7, 2-5). Strapped to pin 30 on a VFR only unit (2-6)
     */
    public readonly actvAnnunciator: OutputPort = new SimVarOutput("ACTV annunciator", undefined, this.pass);
    /**
     * P901 pin 17 APPROACH ARM, pulled low to light the ARM lamp of the GPS APR switch-annunciator (Installation manual
     * 1-7, 2-5). Strapped to pin 30 on an IFR unit without the approach arm switch (2-6)
     */
    public readonly armAnnunciator: OutputPort = new SimVarOutput("ARM annunciator", undefined, this.pass);
    /**
     * Pins 16 and 17 for GPS APPROACH MODE (see ApproachLampGroup)
     */
    public readonly approachLamps: OutputPort = new ApproachLampGroup(this.armAnnunciator, this.actvAnnunciator, this.failures, this.commanded, this.pass);
    /**
     * P901 pin 18 NAV SUPERFLAG (Installation manual 1-7, 2-5). It carries the sim's stand-ins for the flag:
     * L:KLN90B_HSI_TF_FLAGS and GPS IS ACTIVE WAY POINT/FLIGHT PLAN, whose flagged state a failed port leaves (#459)
     */
    public readonly superflag: OutputPort = new SimVarOutput("NAV superflag", () => this.failures.isOutputFailed('superflag'), this.pass);
    /**
     * Fictional: what the sim needs and no wire carries, the GPS SimVar constants, GPS OVERRIDDEN and
     * L:KLN90B_AnnunTest. It never fails
     */
    public readonly sim: OutputPort = new SimVarOutput("Sim", undefined, this.pass);

    //##############
    //###Inputs#####
    //##############

    /**
     * P901 pins 4 (A) and 5 (B), the ARINC 429 EFIS receiver: label 100 selected course, 314/320 heading, from an EFIS or
     * a KA 90 (Installation manual 1-2)
     */
    public readonly arinc429EfisRx: InputPort = new SimVarInput("ARINC 429 EFIS RX");
    /**
     * P901 pins 8 (A) and 9 (B), the ARINC 429 air data receiver: labels 203, 204, 205, 210, 211, 213 (Installation manual
     * 1-2). Unused, it is looped back to the transmitter (2-4)
     */
    public readonly arinc429AirdataRx: InputPort = new SimVarInput("ARINC 429 air data RX", () => this.failures.isInputFailed('arinc429AirdataRx'));
    /**
     * P901 pin 36 RS-232 IN, the fuel/air data formats A to D (Installation manual A-10 to A-13). Unused, it is looped
     * back to pin 13 (2-7)
     */
    public readonly rs232In: InputPort = new SimVarInput("RS-232 IN", () => this.failures.isInputFailed('rs232In'));
    /**
     * P901 pin 26 sine in and pin 37 cosine in from the OBS resolver of the CDI/HSI, excited by pin 31 OBS RESOLVER OUT
     * (Installation manual 1-6, 1-7, 2-6)
     */
    public readonly obsResolver: InputPort = new SimVarInput("OBS resolver", () => this.failures.isInputFailed('obsResolver'));
    /**
     * P901 pins 41-50, gray code pressure altitude D4, A1, A2, A4, B1, B2, B4, C1, C2, C4 from an encoding altimeter
     * (Installation manual 1-6, 2-7, figure 2-17 sheet 3 on 2-47)
     */
    public readonly grayCode: InputPort = new SimVarInput("Gray code", () => this.failures.isInputFailed('grayCode'));
    /**
     * P901 pin 1 GPS DISPLAYED, grounded by the NAV/GPS relay when the indicator shows NAV (Installation manual 1-6, 2-4)
     */
    public readonly gpsDisplayed: InputPort = new SimVarInput("GPS DISPLAYED");
    /**
     * P901 pin 33 LEG/OBS CONTROL, held grounded by the GPS CRS switch in OBS (Installation manual 2-6)
     */
    public readonly legObsControl: InputPort = new SimVarInput("LEG/OBS CONTROL");
    /**
     * P901 pin 40 A/C POWER and pin 27 A/C GROUND (Installation manual 1-5, 2-6, 2-7)
     */
    public readonly power: InputPort = new SimVarInput("Power");

    constructor(private readonly settings: KLN90PlaneSettings, private readonly failures: PortFailureSource = NO_FAILURES) {
    }

    /**
     * Runs write in a null-state pass (#458): the ports listed write even while failed, every other port drops its
     * writes. 'all' is the power change, where every port writes its null state
     */
    public writeNullState(ports: readonly OutputPort[] | 'all', write: () => void): void {
        this.pass.run(ports, write);
    }

    /**
     * The output port by its property name, as the failure catalog names it
     */
    public output(port: FailedOutputPort): OutputPort {
        return this[port];
    }

    //##############
    //###Devices####
    //##############

    /**
     * The digital navigation data for an EFIS, a distance indicator or a moving map (Output.DataInterface)
     */
    public get navData(): OutputPort {
        return this.settings.output.dataInterface === DataInterface.RS232 ? this.rs232Out : this.arinc429Tx;
    }

    /**
     * The bearing to the active waypoint for an RMI (Output.RmiInterface)
     */
    public get rmi(): OutputPort {
        return this.settings.output.rmiInterface === RmiInterface.ARINC429 ? this.arinc429Tx : this.obiBus;
    }

    /**
     * The air data computer (Input.Airdata.Interface). The baro setting always comes over RS-232 IN
     */
    public get airdata(): InputPort {
        return this.settings.input.airdata.interface === DataInterface.ARINC429 ? this.arinc429AirdataRx : this.rs232In;
    }

    /**
     * The selected course of Input.ObsSource (Input.ObsInterface)
     */
    public get obs(): InputPort {
        return this.settings.input.obsInterface === ObsInterface.ARINC429 ? this.arinc429EfisRx : this.obsResolver;
    }

    /**
     * The heading of Input.HeadingInput (Input.HeadingInterface)
     */
    public get heading(): InputPort {
        return this.settings.input.headingInterface === DataInterface.RS232 ? this.rs232In : this.arinc429EfisRx;
    }

    /**
     * The port for a GPS SimVar: the port while Output.WriteGPSSimVars is set, the null port otherwise. The option belongs
     * to the sim's GPS SimVars, not to an interface; the L:KLN90B_* outputs do not go through here
     */
    public gps(port: OutputPort): OutputPort {
        return this.writesGpsSimVars ? port : NULL_OUTPUT;
    }

    /**
     * Output.WriteGPSSimVars, also as switched at runtime by L:KLN90B_WriteGpsSimvars: whether gps() hands out the port
     */
    public get writesGpsSimVars(): boolean {
        return this.settings.output.writeGPSSimVars;
    }
}
