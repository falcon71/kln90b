import {describe, expect, it, vi} from 'vitest';
import {bootToSelfTest, bootUnit, HeadlessUnit, settle} from '../../harness/boot';
import {AIRDATA, fuelComputer, HEADING_INPUT, panelXml, VFR_ONLY} from '../../harness/panelXml';
import {messageLines, messages} from '../../harness/readers';
import {Screen} from '../../harness/render/screen';
import {FailureKey} from '../../../kln90b/failures/FailureCatalog';

/**
 * #458: the unit notices a failure and posts its message (docs/failures.md, "Detection, messages and TEST FAIL"; the
 * design docs/superpowers/specs/2026-11-04-failures-framework-design.md, "Detection and messages"; B-1 to B-4)
 */

const FAILURE_TEXTS = ['NO RS-232 DATA', 'RS-232 DATA ERROR', 'ARINC 429 AIR DATA FAIL', 'ARINC 429 OUTPUT FAIL', 'RS-232 OUTPUT ERROR', 'ALTITUDE FAIL'];
/** The failure messages of the list, in the order of the MSG page, without the messages the boot brings anyway */
const failureMessages = (unit: HeadlessUnit) => messages(unit).filter(m => FAILURE_TEXTS.includes(m));

const ARINC_AIRDATA = {...AIRDATA, 'Input.Airdata.Interface': 'ARINC429'} as const;
const RS232_AIRDATA = {...AIRDATA, 'Input.Airdata.Interface': 'RS232'} as const;

describe('the failure messages (#458)', () => {
    // The bench video: the RS-232 failure shows with the first page, the ARINC 429 air data a few seconds later
    it('the bench video order at a power-on', async () => {
        const unit = await bootToSelfTest({
            panelXml: panelXml({...fuelComputer(), ...ARINC_AIRDATA}),
            storage: {failure_rs232In: '{}', failure_airdata429: '{}'},
        });
        // Precondition: nothing is shown while the unit runs its self-test
        expect(failureMessages(unit)).toEqual([]);

        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(1100); // One calculation tick after the main page
        expect(failureMessages(unit)).toEqual(['NO RS-232 DATA']);
        expect(unit.props.messageHandler.hasUnreadMessages()).toBe(true);

        await vi.advanceTimersByTimeAsync(2000);
        expect(failureMessages(unit)).toEqual(['NO RS-232 DATA']); // About 3 s after the main page: not yet

        await vi.advanceTimersByTimeAsync(3000);
        // The list is oldest first. The air data is the unit's altitude here, so its failure brings ALTITUDE FAIL with it
        expect(failureMessages(unit)).toEqual(['NO RS-232 DATA', 'ALTITUDE FAIL', 'ARINC 429 AIR DATA FAIL']);
        expect(unit.props.messageHandler.hasUnreadMessages()).toBe(true);
        await unit.panel.msg();
        const rows = Array.from({length: 6}, (_, r) => Screen.read().row(r).trimEnd());
        expect(rows.indexOf('ARINC 429 AIR DATA FAIL')).toBeGreaterThanOrEqual(0);
        expect(rows.indexOf('ARINC 429 AIR DATA FAIL')).toBeLessThan(rows.indexOf('NO RS-232 DATA')); // The newer first (3-16)
        expect(unit.errors).toEqual([]);
    }, 20_000);

    const CASES: { key: FailureKey, panel: Parameters<typeof panelXml>[0], text: string, also?: string }[] = [
        {key: 'arinc429Out', panel: {}, text: 'ARINC 429 OUTPUT FAIL'},
        {key: 'rs232Out', panel: {'Output.DataInterface': 'RS232'}, text: 'RS-232 OUTPUT ERROR'},
        {key: 'rs232In', panel: fuelComputer(), text: 'NO RS-232 DATA'},
        {key: 'rs232Data', panel: fuelComputer(), text: 'RS-232 DATA ERROR'},
        {key: 'airdata429', panel: ARINC_AIRDATA, text: 'ARINC 429 AIR DATA FAIL', also: 'ALTITUDE FAIL'},
        {key: 'altitude', panel: {}, text: 'ALTITUDE FAIL'},
    ];
    for (const c of CASES) {
        it(`each message: ${c.key} shows ${c.text}`, async () => {
            const unit = await bootUnit({panelXml: panelXml(c.panel)});
            await settle(unit);
            expect(failureMessages(unit)).toEqual([]); // Precondition: nothing before the failure

            unit.props.failures.fail(c.key);
            await vi.advanceTimersByTimeAsync(1000);
            if (c.key === 'arinc429Out' || c.key === 'rs232Out') {
                expect(failureMessages(unit)).toEqual([c.text]); // The unit's own part: at the next tick
            }
            await vi.advanceTimersByTimeAsync(11_000); // Past the longest delay

            expect(failureMessages(unit).sort()).toEqual([c.text, ...(c.also ? [c.also] : [])].sort()); // The air data is also the altitude
            expect(unit.errors).toEqual([]);
        }, 20_000);
    }

    it('a repair removes the message', async () => {
        const unit = await bootUnit({panelXml: panelXml(fuelComputer())});
        await settle(unit);
        unit.props.failures.fail('rs232In');
        await vi.advanceTimersByTimeAsync(11_000);
        expect(failureMessages(unit)).toEqual(['NO RS-232 DATA']); // Precondition

        unit.props.failures.repair('rs232In');
        await vi.advanceTimersByTimeAsync(2000);

        expect(failureMessages(unit)).toEqual([]);
    }, 20_000);
});

describe('ALTITUDE FAIL follows the failed altitude (#458)', () => {
    async function failedAfter(opts: Parameters<typeof panelXml>[0], key: FailureKey): Promise<HeadlessUnit> {
        const unit = await bootUnit({panelXml: panelXml(opts)});
        await settle(unit);
        expect(messages(unit)).not.toContain('ALTITUDE FAIL'); // Precondition: not at boot with nothing failed
        unit.props.failures.fail(key);
        await vi.advanceTimersByTimeAsync(12_000);
        return unit;
    }

    it('the gray code failure on the default panel', async () => {
        const unit = await failedAfter({}, 'altitude');
        expect(messages(unit)).toContain('ALTITUDE FAIL');
    }, 20_000);

    it('also on a VFR panel', async () => {
        const unit = await failedAfter(VFR_ONLY, 'altitude');
        expect(messages(unit)).toContain('ALTITUDE FAIL');
    }, 20_000);

    it('RS-232 air data and a failed RS-232 input give both messages', async () => {
        const unit = await failedAfter({...RS232_AIRDATA}, 'rs232In');
        expect(failureMessages(unit).sort()).toEqual(['ALTITUDE FAIL', 'NO RS-232 DATA']);
    }, 20_000);

    it('ARINC 429 air data and a failed RS-232 input give only NO RS-232 DATA', async () => {
        const unit = await failedAfter({...ARINC_AIRDATA, ...fuelComputer()}, 'rs232In');
        expect(failureMessages(unit)).toEqual(['NO RS-232 DATA']);
    }, 20_000);

    it('ARINC 429 air data and the failure of its receiver give both of its messages', async () => {
        const unit = await failedAfter({...ARINC_AIRDATA}, 'airdata429');
        expect(failureMessages(unit).sort()).toEqual(['ALTITUDE FAIL', 'ARINC 429 AIR DATA FAIL']);
    }, 20_000);
});

describe('detection over the start and the power cycle (#458)', () => {
    it('a force-ready boot while failed', async () => {
        const unit = await bootUnit({storage: {failure_arinc429Out: '{}'}}); // The engine is running: no welcome pages
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.errors).toEqual([]);
        expect(failureMessages(unit)).toEqual(['ARINC 429 OUTPUT FAIL']);
    });

    it('a power cycle restarts detection', async () => {
        const unit = await bootUnit({panelXml: panelXml(fuelComputer()), storage: {failure_rs232In: '{}'}});
        await vi.advanceTimersByTimeAsync(3000);
        expect(failureMessages(unit)).toEqual(['NO RS-232 DATA']); // Precondition

        await unit.panel.powerCycle({offSeconds: 600});
        await vi.advanceTimersByTimeAsync(3000); // The welcome page: the main page has not shown
        expect(unit.props.memory.failureDetection.mainPageShown).toBe(false); // Precondition of the check below
        expect(failureMessages(unit)).toEqual([]);

        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(1100);
        expect(failureMessages(unit)).toEqual(['NO RS-232 DATA']);
        expect(Screen.read().status().left).not.toBe('');
    }, 20_000);

    // Review Focus 1: the failure stays stored but is not effective without the part
    it('an ineligible failure shows no message', async () => {
        const unit = await bootUnit({panelXml: panelXml({...HEADING_INPUT, 'Input.HeadingInterface': 'RS232'}), storage: {failure_rs232In: '{}'}});
        await vi.advanceTimersByTimeAsync(3000);
        expect(failureMessages(unit)).toEqual(['NO RS-232 DATA']); // Precondition: the heading input makes it eligible

        unit.env.sim.set('L:KLN90B_HeadingInput', 'bool', 0);
        await vi.advanceTimersByTimeAsync(2000);
        expect(failureMessages(unit)).toEqual([]);
        expect(unit.props.failures.activeList().map(d => d.key)).toContain('rs232In'); // Still failed, FLR 2 lists it

        unit.env.sim.set('L:KLN90B_HeadingInput', 'bool', 1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(failureMessages(unit)).toEqual([]); // Not at once: the delay of a failure in operation
        await vi.advanceTimersByTimeAsync(11_000);
        expect(failureMessages(unit)).toEqual(['NO RS-232 DATA']);
    }, 20_000);
});

describe('BATTERY LOW (#461)', () => {
    const LOW = ['BATTERY LOW: SERVICE', 'REQUIRED TO PREVENT', 'LOSS OF USER DATA'];

    // CMM 22 gives the low threshold, B-2 the message; the 1.5 % edge is our reading of it
    it('BATTERY LOW at 1.5 %', async () => {
        const unit = await bootUnit({storage: {batteryHealth: 1.5}});
        await vi.advanceTimersByTimeAsync(2000);
        expect(messageLines(unit)).toContainEqual(LOW);
    });

    it('no BATTERY LOW at 1.51 %', async () => {
        const unit = await bootUnit({storage: {batteryHealth: 1.51}});
        await vi.advanceTimersByTimeAsync(2000);
        expect(messageLines(unit)).not.toContainEqual(LOW);
    });

    it('a failed battery at full charge shows it', async () => {
        const unit = await bootUnit({storage: {batteryHealth: 100, failure_battery: '{}'}});
        await vi.advanceTimersByTimeAsync(2000);
        expect(messageLines(unit)).toContainEqual(LOW);
    });

    it('is not listed on the self-test page and goes after SERVICE?', async () => {
        const unit = await bootToSelfTest({storage: {batteryHealth: 1}});
        expect(messageLines(unit)).not.toContainEqual(LOW);

        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(2000);
        expect(messageLines(unit)).toContainEqual(LOW); // Precondition

        unit.props.battery.service();
        await vi.advanceTimersByTimeAsync(2000);
        expect(messageLines(unit)).not.toContainEqual(LOW);
    });
});
