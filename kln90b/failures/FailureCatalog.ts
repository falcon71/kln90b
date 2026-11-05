import {DataInterface, KLN90PlaneSettings, ObsInterface, RmiInterface} from "../settings/KLN90BPlaneSettings";

/**
 * The failures the pilot or the random trigger can cause (#458). Each one takes away what the real part carries: its
 * outputs and its inputs, the Interconnect ports named below.
 */
export type FailureKey = 'arinc429Out' | 'rs232Out' | 'rmiOutput' | 'obsResolver' | 'rs232In' | 'rs232Data' | 'airdata429' | 'altitude' | 'eeprom'
    | 'msgBulb' | 'wptBulb' | 'armBulb' | 'actvBulb' | 'msgWiring' | 'wptWiring' | 'armWiring' | 'actvWiring'
    | 'msgDriver' | 'wptDriver' | 'armDriver' | 'actvDriver' | 'superflag';

/** Interconnect property names of the output ports */
export type FailedOutputPort = 'arinc429Tx' | 'rs232Out' | 'obiBus' | 'superflag';
/** Interconnect property names of the input ports */
export type FailedInputPort = 'obsResolver' | 'rs232In' | 'arinc429AirdataRx' | 'grayCode';

/** Who notices the failure and so how long the message takes; null = no message */
export type Detection = 'internal' | 'rs232' | 'arinc429' | 'commandedOn' | 'commandedOff' | null;

/** The remote lamps (#459) */
export type Lamp = 'msg' | 'wpt' | 'arm' | 'actv';
/** What is wrong with a lamp: the bulb is burnt out, the output is shorted so the lamp is bypassed, or the driver stage is stuck on */
export type LampFaultKind = 'bulb' | 'wiring' | 'driver';
/** The signals the unit commands that a failure can be detected against */
export type CommandedSignal = Lamp | 'superflag';

export interface FailureDefinition {
    readonly key: FailureKey;
    /** The name on FLR 2 and 3, at most 11 characters */
    readonly flrName: string;
    /** The random trigger may pick it */
    readonly random: boolean;
    /** The self-test (TEST FAIL) shows it */
    readonly testFail: boolean;
    readonly outputs: readonly FailedOutputPort[];
    readonly inputs: readonly FailedInputPort[];
    /** The lines of the MSG page; null: no message of its own */
    readonly message: readonly string[] | null;
    readonly detection: Detection;
    /** The commanded signal a 'commandedOn' or 'commandedOff' failure is detected against (#459) */
    readonly signal?: CommandedSignal;
    /** Set for the lamp failures (#459) */
    readonly lamp?: { lamp: Lamp, kind: LampFaultKind };

    /** Whether the aircraft's wiring has the part. Evaluated at every call, as the settings can change */
    isEligible(settings: KLN90PlaneSettings): boolean;
}

function rs232InEligible(s: KLN90PlaneSettings): boolean {
    return s.input.fuelComputer.isInterfaced
        || (s.input.airdata.isInterfaced && (s.input.airdata.interface === DataInterface.RS232 || s.input.airdata.baroSource !== 0))
        || (s.input.headingInput && s.input.headingInterface === DataInterface.RS232);
}

const LAMPS: readonly Lamp[] = ['msg', 'wpt', 'arm', 'actv'];

/** The lamp's `...Installed`; ARM and ACTV reach the aircraft only through GPS APPROACH MODE, written only with WriteGPSSimVars */
function lampEligible(lamp: Lamp, s: KLN90PlaneSettings): boolean {
    const a = s.output.externalAnnunciators;
    switch (lamp) {
        case 'msg':
            return a.msgInstalled;
        case 'wpt':
            return a.wptInstalled;
        case 'arm':
            return a.armInstalled && s.output.writeGPSSimVars;
        case 'actv':
            return a.actvInstalled && s.output.writeGPSSimVars;
    }
}

//The driver is stuck on (lit at all times), the output is shorted with the lamp bypassed, and the bulb is burnt out: the
//pilot sees a dark lamp for the last two. The sense circuit sees the short and the driver, not the bulb (CMM 25-26)
function lampFailures(): FailureDefinition[] {
    const list: FailureDefinition[] = [];
    for (const lamp of LAMPS) {
        const name = lamp.toUpperCase();
        list.push({
            key: `${lamp}Driver`, flrName: `${name} DRIVER`, random: true, testFail: true,
            outputs: [], inputs: [], message: [`${name} ANNUNCIATOR FAIL`], detection: 'commandedOff', signal: lamp,
            lamp: {lamp, kind: 'driver'}, isEligible: s => lampEligible(lamp, s),
        });
        list.push({
            key: `${lamp}Wiring`, flrName: `${name} WIRING`, random: true, testFail: false,
            outputs: [], inputs: [], message: [`CHECK ${name} ANNUNCIATOR`], detection: 'commandedOn', signal: lamp,
            lamp: {lamp, kind: 'wiring'}, isEligible: s => lampEligible(lamp, s),
        });
        list.push({
            key: `${lamp}Bulb`, flrName: `${name} BULB`, random: true, testFail: false,
            outputs: [], inputs: [], message: null, detection: null,
            lamp: {lamp, kind: 'bulb'}, isEligible: s => lampEligible(lamp, s),
        });
    }
    return list;
}

export const FAILURE_CATALOG: readonly FailureDefinition[] = [
    {
        key: 'arinc429Out', flrName: '429 OUTPUT', random: true, testFail: true,
        outputs: ['arinc429Tx'], inputs: [], message: ['ARINC 429 OUTPUT FAIL'], detection: 'internal',
        isEligible: () => true,
    },
    {
        key: 'rs232Out', flrName: 'RS-232 OUT', random: true, testFail: true,
        outputs: ['rs232Out'], inputs: [], message: ['RS-232 OUTPUT ERROR'], detection: 'internal',
        isEligible: s => s.output.dataInterface === DataInterface.RS232,
    },
    {
        key: 'rmiOutput', flrName: 'RMI OUTPUT', random: true, testFail: false,
        outputs: ['obiBus'], inputs: [], message: null, detection: null,
        isEligible: s => s.output.rmiInterface === RmiInterface.OBI && s.output.rmiInstalled,
    },
    {
        key: 'obsResolver', flrName: 'OBS INPUT', random: true, testFail: false,
        outputs: [], inputs: ['obsResolver'], message: null, detection: null,
        isEligible: s => s.input.obsInterface === ObsInterface.ANALOG && s.input.obsSource !== 0,
    },
    {
        key: 'rs232In', flrName: 'RS-232 IN', random: true, testFail: false,
        outputs: [], inputs: ['rs232In'], message: ['NO RS-232 DATA'], detection: 'rs232',
        isEligible: rs232InEligible,
    },
    {
        key: 'rs232Data', flrName: 'RS-232 DATA', random: true, testFail: false,
        outputs: [], inputs: ['rs232In'], message: ['RS-232 DATA ERROR'], detection: 'rs232',
        isEligible: rs232InEligible,
    },
    {
        key: 'airdata429', flrName: '429 AIRDATA', random: true, testFail: false,
        outputs: [], inputs: ['arinc429AirdataRx'], message: ['ARINC 429 AIR DATA FAIL'], detection: 'arinc429',
        isEligible: s => s.input.airdata.isInterfaced && s.input.airdata.interface === DataInterface.ARINC429,
    },
    {
        key: 'altitude', flrName: 'ALTITUDE', random: true, testFail: false,
        outputs: [], inputs: ['grayCode'], message: null, detection: 'arinc429', //Its message is ALTITUDE FAIL, which belongs to the altitude input in general (PersistentMessages)
        isEligible: s => s.input.altimeterInterfaced && !s.input.airdata.isInterfaced,
    },
    {
        //#459: the unit falls back to nominal values, so the screen is off center and the D-bar is off (EepromCalibration)
        key: 'eeprom', flrName: 'EEPROM', random: true, testFail: true,
        outputs: [], inputs: [], message: ['EEPROM FAILURE: IC1045', 'EXTERNAL D-BAR INVALID'], detection: 'internal',
        isEligible: () => true,
    },
    {
        //#459: P901 pin 18, IM 1-7, 2-5
        key: 'superflag', flrName: 'SUPERFLAG', random: true, testFail: true,
        outputs: ['superflag'], inputs: [], message: ['NAV SUPER FLAG FAILURE'], detection: 'commandedOn', signal: 'superflag',
        isEligible: () => true,
    },
    ...lampFailures(),
];

export function failureSettingName(key: FailureKey): `failure_${FailureKey}` {
    return `failure_${key}`;
}
