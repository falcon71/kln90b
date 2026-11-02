import {SimVarValueType} from "@microsoft/msfs-sdk";
import {DataInterface, KLN90PlaneSettings, ObsInterface, RmiInterface} from "./settings/KLN90BPlaneSettings";

//The physical interfaces of the unit, one object each, after the interconnect drawing (Installation manual 006-10521-0005
//Rev 5, figure 2-17, 2-45 to 2-57) (#451). Every SimVar the unit reads or writes for an input or an output goes through
//the port of the interface the real unit uses for it, so the code says which SimVars an interface carries. The failure
//simulation (#366) fails a port: a failed output stops writing, a failed input reports it is not receiving. Until then
//every port works.
//The "Real unit:" comments at the call sites explain the value; the comments here explain the wire.

/**
 * One physical output of the unit
 */
export interface OutputPort {
    readonly name: string;
    /**
     * False while nothing leaves this interface. Always true until #366
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
     * False while nothing arrives on this interface. Always true until #366
     */
    readonly isReceiving: boolean;

    read(simVar: string, unit: SimVarValueType | string): any;
}

export class SimVarOutput implements OutputPort {
    constructor(public readonly name: string) {
    }

    public get isTransmitting(): boolean {
        return true;
    }

    public write(simVar: string, unit: SimVarValueType | string, value: number | boolean | string): void {
        if (this.isTransmitting) {
            SimVar.SetSimVarValue(simVar, unit, value);
        }
    }
}

export class SimVarInput implements InputPort {
    constructor(public readonly name: string) {
    }

    public get isReceiving(): boolean {
        return true;
    }

    public read(simVar: string, unit: SimVarValueType | string): any {
        return SimVar.GetSimVarValue(simVar, unit);
    }
}

/**
 * Where a write goes that must not reach the sim: the GPS SimVars without Output.WriteGPSSimVars
 */
export const NULL_OUTPUT: OutputPort = {
    name: "none",
    isTransmitting: false,
    write(): void {
    },
};

/**
 * GPS APPROACH MODE lights the ARM lamp (1) and the ACTV lamp (2), and both on the self-test (3); it is the SimVar the wiki
 * documents for the lamps of the GPS APR switch-annunciator, so it stays one SimVar over two outputs. The group passes the
 * value through. With #366 it changes the value for a failed lamp instead of dropping the write, so the lamp that works
 * keeps working: with ARM failed 1 becomes 0 and 3 becomes 2, with ACTV failed 2 becomes 0 and 3 becomes 1
 */
export class ApproachLampGroup implements OutputPort {
    public readonly name = "Approach lamps";

    constructor(private readonly arm: OutputPort, private readonly actv: OutputPort) {
    }

    public get isTransmitting(): boolean {
        return this.arm.isTransmitting || this.actv.isTransmitting;
    }

    public write(simVar: string, unit: SimVarValueType | string, value: number | boolean | string): void {
        if (this.isTransmitting) {
            SimVar.SetSimVarValue(simVar, unit, value);
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

    //##############
    //###Outputs####
    //##############

    /**
     * P901 pins 23 (A) and 24 (B), ARINC 429 low speed, GAMA format. Labels in the Installation manual 1-3, 1-4
     */
    public readonly arinc429Tx: OutputPort = new SimVarOutput("ARINC 429 TX");
    /**
     * P901 pin 13 RS-232 OUT, 9600 baud 8N1, items in the Installation manual A-1 to A-9. It can drive several inputs
     */
    public readonly rs232Out: OutputPort = new SimVarOutput("RS-232 OUT");
    /**
     * The CDI/HSI outputs: P901 pin 22 +RIGHT against pin 25 +LEFT/NAV FLAG- (deviation), pin 21 +TO against pin 20 +FROM,
     * pin 19 NAV FLAG+ against pin 25, pin 18 NAV SUPERFLAG (Installation manual 1-7, 1-8, 2-5)
     */
    public readonly analogNav: OutputPort = new SimVarOutput("Analog nav");
    /**
     * P901 pins 10 OBI DATA, 11 OBI CLOCK, 12 OBI SYNC, the Honeywell serial bus for an RMI, or a sin/cos OBI through a
     * KDA 692 (Installation manual 1-7, 2-4)
     */
    public readonly obiBus: OutputPort = new SimVarOutput("OBI");
    /**
     * P901 pin 14 WPT ALERT, pulled low to light a remote lamp (Installation manual 1-7, 2-5)
     */
    public readonly wptAnnunciator: OutputPort = new SimVarOutput("WPT annunciator");
    /**
     * P901 pin 15 MSG, pulled low to light a remote lamp (Installation manual 1-7, 2-5)
     */
    public readonly msgAnnunciator: OutputPort = new SimVarOutput("MSG annunciator");
    /**
     * P901 pin 16 APPROACH ACTIVE, pulled low to light the ACTV lamp of the GPS APR switch-annunciator (Installation
     * manual 1-7, 2-5). Strapped to pin 30 on a VFR only unit (2-6)
     */
    public readonly actvAnnunciator: OutputPort = new SimVarOutput("ACTV annunciator");
    /**
     * P901 pin 17 APPROACH ARM, pulled low to light the ARM lamp of the GPS APR switch-annunciator (Installation manual
     * 1-7, 2-5). Strapped to pin 30 on an IFR unit without the approach arm switch (2-6)
     */
    public readonly armAnnunciator: OutputPort = new SimVarOutput("ARM annunciator");
    /**
     * Pins 16 and 17 for GPS APPROACH MODE (see ApproachLampGroup)
     */
    public readonly approachLamps: OutputPort = new ApproachLampGroup(this.armAnnunciator, this.actvAnnunciator);
    /**
     * Fictional: what the sim needs and no wire carries, the GPS SimVar constants, GPS OVERRIDDEN and
     * L:KLN90B_AnnunTest. It never fails
     */
    public readonly sim: OutputPort = new SimVarOutput("Sim");

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
    public readonly arinc429AirdataRx: InputPort = new SimVarInput("ARINC 429 air data RX");
    /**
     * P901 pin 36 RS-232 IN, the fuel/air data formats A to D (Installation manual A-10 to A-13). Unused, it is looped
     * back to pin 13 (2-7)
     */
    public readonly rs232In: InputPort = new SimVarInput("RS-232 IN");
    /**
     * P901 pin 26 sine in and pin 37 cosine in from the OBS resolver of the CDI/HSI, excited by pin 31 OBS RESOLVER OUT
     * (Installation manual 1-6, 1-7, 2-6)
     */
    public readonly obsResolver: InputPort = new SimVarInput("OBS resolver");
    /**
     * P901 pins 41-50, gray code pressure altitude D4, A1, A2, A4, B1, B2, B4, C1, C2, C4 from an encoding altimeter
     * (Installation manual 1-6, 2-7, figure 2-17 sheet 3 on 2-47)
     */
    public readonly grayCode: InputPort = new SimVarInput("Gray code");
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

    constructor(private readonly settings: KLN90PlaneSettings) {
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
        return this.settings.output.writeGPSSimVars ? port : NULL_OUTPUT;
    }
}
