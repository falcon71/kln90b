import {DataInterface, KLN90PlaneSettings, ObsInterface, RmiInterface} from "../settings/KLN90BPlaneSettings";

/**
 * The failures the pilot or the random trigger can cause (#458). Each one takes away what the real part carries: its
 * outputs and its inputs, the Interconnect ports named below.
 */
export type FailureKey = 'arinc429Out' | 'rs232Out' | 'rmiOutput' | 'obsResolver' | 'rs232In' | 'rs232Data' | 'airdata429' | 'altitude';

/** Interconnect property names of the output ports */
export type FailedOutputPort = 'arinc429Tx' | 'rs232Out' | 'obiBus';
/** Interconnect property names of the input ports */
export type FailedInputPort = 'obsResolver' | 'rs232In' | 'arinc429AirdataRx' | 'grayCode';

/** Who notices the failure and so how long the message takes; null = no message */
export type Detection = 'internal' | 'rs232' | 'arinc429' | null;

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

    /** Whether the aircraft's wiring has the part. Evaluated at every call, as the settings can change */
    isEligible(settings: KLN90PlaneSettings): boolean;
}

function rs232InEligible(s: KLN90PlaneSettings): boolean {
    return s.input.fuelComputer.isInterfaced
        || (s.input.airdata.isInterfaced && (s.input.airdata.interface === DataInterface.RS232 || s.input.airdata.baroSource !== 0))
        || (s.input.headingInput && s.input.headingInterface === DataInterface.RS232);
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
];

export function failureSettingName(key: FailureKey): `failure_${FailureKey}` {
    return `failure_${key}`;
}
