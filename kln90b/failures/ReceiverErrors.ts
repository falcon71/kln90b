import {EventBus} from '@microsoft/msfs-sdk';
import {Failures, FailureChangedEvents} from "./Failures";
import {FailureKey} from "./FailureCatalog";

//The bits of the receiver error word (#471). The unit shows them as four hex digits (IM C-3, C-4; KLN 900 Pilot's Guide B-6)
export const RCVR_ROM = 0x0002;
export const RCVR_RAM = 0x0004;
export const RCVR_MEMORY = 0x0008;
export const RCVR_RF = 0x0010;
export const RCVR_ASIC = 0x0080;
export const RCVR_BBP = 0x0100;
export const RCVR_INIT = 0x0400;
export const RCVR_EEPROM = 0x0800;
export const RCVR_BBP_UNDER = 0x2000;
export const RCVR_BBP_OVER = 0x8000;

/** The bits after which the receiver delivers nothing (IM C-3, C-4, C-7) */
const DEAD_MASK = RCVR_ROM | RCVR_RAM | RCVR_ASIC | RCVR_RF | RCVR_BBP | RCVR_BBP_UNDER | RCVR_BBP_OVER;
/** The hardware codes that show while the failure lasts; the others are found by the power-on test */
const LIVE_HARDWARE_MASK = RCVR_BBP_UNDER | RCVR_BBP_OVER;
const HARDWARE_CODES = [RCVR_ROM, RCVR_RAM, RCVR_ASIC, RCVR_BBP_UNDER, RCVR_BBP_OVER];

const LOSS_DB_MIN = 6;
const LOSS_DB_SPAN = 9;
const FACTOR_MIN = 2;
const FACTOR_SPAN = 2;

const KEYS: readonly FailureKey[] = ['gpsAntenna', 'rcvrMemory', 'rcvrHardware', 'rcvrInit', 'rcvrEeprom', 'antennaGain'];

/** Four uppercase hex digits, as the unit shows the word */
export function formatReceiverCode(code: number): string {
    return ('0000' + code.toString(16).toUpperCase()).slice(-4);
}

function isBit(values: Record<string, number>, key: string): boolean {
    return values[key] === 0 || values[key] === 1;
}

/**
 * The receiver error word (#471). The power-on bits are what the latch recorded at the start of a power-on; the live bits
 * follow the failure as it is now. Values are cached at failureChanged, and the getters allocate nothing and read no setting
 * text. The draws use the injected random and are saved, so a failure stays the same across a session.
 */
export class ReceiverErrors {
    //The cache of the stored values; a field is 0/false while its failure is not effective
    private antennaOpen = false;
    private antennaShort = false;
    private hardwareCode = 0;
    private lossDb = 0;
    private memoryFailed = false;
    private memoryTransient = false;
    private initFailed = false;
    private initTransient = false;
    private eepromFailed = false;
    private eepromTransient = false;
    private liveBits = 0;

    //The latch of this power-on
    private latchedBits = 0;
    private latchedTestBits = 0;
    private memoryLost = false;
    private blocked = false;
    private factor = 1;

    constructor(bus: EventBus, private readonly failures: Failures, private readonly takeHomeMode: boolean, public random: () => number = Math.random) {
        for (const key of KEYS) {
            this.refresh(key);
        }
        bus.getSubscriber<FailureChangedEvents>().on("failureChanged").handle(e => {
            if (KEYS.includes(e.key)) {
                this.refresh(e.key);
            }
        });
    }

    /**
     * The start of a power-on: records the bits found at this power-on and replaces those of the one before. A transient
     * failure that acted is repaired, its bit stays for this power-on. A failure started in operation acts only here.
     * @param batteryWipe The battery's memory wipe ran for this power-on
     */
    public latchPowerOn(batteryWipe: boolean): void {
        this.latchedBits = 0;
        this.memoryLost = false;
        this.blocked = false;
        this.factor = 1;
        if (this.takeHomeMode) {
            this.latchedTestBits = 0;
            return;
        }
        if (batteryWipe) {
            this.latchedBits |= RCVR_MEMORY;
        }
        const repairs: FailureKey[] = [];
        if (this.memoryFailed) {
            this.latchedBits |= RCVR_MEMORY;
            this.memoryLost = true;
            if (this.memoryTransient) {
                repairs.push('rcvrMemory');
            }
        }
        this.latchedBits |= this.hardwareCode & ~LIVE_HARDWARE_MASK;
        if (this.initFailed) {
            this.latchedBits |= RCVR_INIT;
            this.blocked = true;
            if (this.initTransient) {
                repairs.push('rcvrInit');
            }
        }
        if (this.eepromFailed) {
            this.latchedBits |= RCVR_EEPROM;
            this.factor = FACTOR_MIN + this.random() * FACTOR_SPAN;
            if (this.eepromTransient) {
                repairs.push('rcvrEeprom');
            }
        }
        this.latchedTestBits = this.latchedBits;
        for (const key of repairs) {
            this.failures.repair(key);
        }
    }

    /** The word: the power-on bits (the 0008 until a satellite is tracked) and the live bits */
    public get code(): number {
        return this.takeHomeMode ? 0 : this.latchedBits | this.liveBits;
    }

    /** What the host can read: nothing while the receiver does not talk to it */
    public get reportedCode(): number {
        return this.hostSilent ? 0 : this.code;
    }

    /** The word for TEST FAIL: the 0008 as latched, even after a satellite was tracked */
    public get testFailCode(): number {
        return this.takeHomeMode || this.hostSilent ? 0 : this.latchedTestBits | this.liveBits;
    }

    public get receiverDead(): boolean {
        return (this.code & DEAD_MASK) !== 0;
    }

    public get memoryLostAtPowerOn(): boolean {
        return this.memoryLost;
    }

    public get hostBlocked(): boolean {
        return this.blocked;
    }

    /** How much longer the acquisition takes: the factor drawn at the power-on with the 0800 latched, else 1 */
    public get acquisitionFactor(): number {
        return (this.latchedBits & RCVR_EEPROM) !== 0 ? this.factor : 1;
    }

    /** The loss of every satellite's SNR in dB (IM C-7) */
    public get antennaLossDb(): number {
        return this.lossDb;
    }

    /** A satellite is tracked: the memory error leaves the word, but not the TEST FAIL record */
    public satelliteTracked(): void {
        this.latchedBits &= ~RCVR_MEMORY;
    }

    public get memoryBitSet(): boolean {
        return !this.takeHomeMode && (this.latchedBits & RCVR_MEMORY) !== 0;
    }

    //One setting read; the host does not read the word while NO RCVR DATA
    private get hostSilent(): boolean {
        return this.failures.isEffective('gpsReceiver');
    }

    private refresh(key: FailureKey): void {
        if (this.takeHomeMode) {
            return;
        }
        const effective = this.failures.isEffective(key);
        switch (key) {
            case 'gpsAntenna':
                this.antennaOpen = effective;
                this.antennaShort = effective && this.loadShort();
                break;
            case 'rcvrMemory':
                this.memoryFailed = effective;
                this.memoryTransient = effective && this.loadTransient(key);
                break;
            case 'rcvrInit':
                this.initFailed = effective;
                this.initTransient = effective && this.loadTransient(key);
                break;
            case 'rcvrEeprom':
                this.eepromFailed = effective;
                this.eepromTransient = effective && this.loadTransient(key);
                break;
            case 'rcvrHardware':
                this.hardwareCode = effective ? this.loadHardware() : 0;
                break;
            case 'antennaGain':
                this.lossDb = effective ? this.loadLoss() : 0;
                break;
        }
        this.liveBits = (this.antennaOpen ? RCVR_RF | (this.antennaShort ? RCVR_BBP : 0) : 0) | (this.hardwareCode & LIVE_HARDWARE_MASK);
    }

    private loadShort(): boolean {
        const v = this.failures.values('gpsAntenna');
        if (!isBit(v, 'short')) {
            v.short = this.random() < 0.5 ? 1 : 0;
            this.failures.setValues('gpsAntenna', {short: v.short});
        }
        return v.short === 1;
    }

    private loadTransient(key: FailureKey): boolean {
        const v = this.failures.values(key);
        if (!isBit(v, 'transient')) {
            v.transient = this.random() < 0.5 ? 1 : 0;
            this.failures.setValues(key, {transient: v.transient});
        }
        return v.transient === 1;
    }

    private loadHardware(): number {
        const v = this.failures.values('rcvrHardware');
        if (typeof v.code !== 'number' || !HARDWARE_CODES.includes(v.code)) {
            v.code = HARDWARE_CODES[Math.floor(this.random() * HARDWARE_CODES.length)];
            this.failures.setValues('rcvrHardware', {code: v.code});
        }
        return v.code;
    }

    private loadLoss(): number {
        const v = this.failures.values('antennaGain');
        if (typeof v.lossDb !== 'number' || !isFinite(v.lossDb) || v.lossDb < LOSS_DB_MIN || v.lossDb > LOSS_DB_MIN + LOSS_DB_SPAN) {
            v.lossDb = LOSS_DB_MIN + this.random() * LOSS_DB_SPAN;
            this.failures.setValues('antennaGain', {lossDb: v.lossDb});
        }
        return v.lossDb;
    }
}
