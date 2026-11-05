import {describe, expect, it, vi} from 'vitest';
import {bootToSelfTest, bootUnit, HeadlessUnit, moveAircraft, settle, untilCalcTick} from '../../harness/boot';
import {courseDeg, pointBefore, pointFrom} from '../../harness/flight/geo';
import {standardRoute} from '../../harness/fixtures';
import {BASE, SIM_VARS} from '../../harness/interconnect';
import {panelXml} from '../../harness/panelXml';
import {messageLines} from '../../harness/readers';
import {Screen} from '../../harness/render/screen';
import {openFlr1, rows} from '../../harness/render/flrPages';
import {bootOnStandardRoute} from '../../harness/worldBoot';

/**
 * #459: the EEPROM fails (docs/failures.md, "EEPROM"; the design
 * docs/superpowers/specs/2026-11-05-failures-lamps-superflag-eeprom-design.md, "The unit's EEPROM calibration", "The
 * EEPROM" and the amendment of 2026-11-05). The unit falls back to nominal values: the screen is off center by the stored
 * centering, and GPS WP CROSS TRK carries the gain and zero point of the stored D-bar calibration points.
 *
 * The unit reads the EEPROM at a power-on only and works from that read until the next one, so a failure or a repair
 * in operation takes effect at the next power-on. The tests of the effects boot with the failure stored, which the
 * session's first power-on reads
 */

/**
 * The stored calibration: centering 3 and -5 CRT pixels, so the screen shifts by -12 and +20 screen pixels. The D-bar
 * points +200 and -300 mV give a gain of 600 / 500 = 1.2 and a zero point of 300 - 1.2 × 200 = 60 mV, 0.4 of the 150 mV
 * of full scale
 */
const CALIBRATION = {eepromCrtCenterX: 3, eepromCrtCenterY: -5, eepromDbarCalPlus: 200, eepromDbarCalMinus: -300};
const GAIN = 1.2;
const ZERO_SHARE = 0.4;
const SHIFT = 'translate(-12px, 20px)';

const POSITION = {lat: 47, lon: 8};

/** A failure stored by an earlier session */
const failed = (key: string) => ({[`failure_${key}`]: '{}'});

const nm = (unit: HeadlessUnit, name: string) => unit.env.sim.get(name, 'nautical miles');

const transform = () => document.getElementById('pageContainer')!.style.transform;

const eepromMessages = (unit: HeadlessUnit) => messageLines(unit).filter(m => m[0].includes('EEPROM'));

/**
 * A copy of SuperflagFailure.test.ts' helper with the calibration stored: every input switched on, 0.5 NM right of the
 * leg KAAA - ABC and banking back, so the cross track is not 0. The position holds afterwards, so the values stay
 */
async function offCourse(storage: Record<string, unknown> = {}): Promise<HeadlessUnit> {
    const {kaaa, abc} = standardRoute();
    // The barometer of the air data, so that the Self Test page of a power cycle shows a sane altitude
    const baro = {name: 'KOHLSMAN SETTING HG:1', unit: 'inches of mercury', value: 29.92};
    const unit = await bootOnStandardRoute({panelXml: panelXml(BASE), simVars: [...SIM_VARS, baro], magvar: 0, storage: {...CALIBRATION, ...storage}});
    const mid = pointBefore(kaaa, abc, 10);
    const dtk = courseDeg(mid, abc);
    await moveAircraft(unit, pointFrom(mid, dtk + 90, 0.5), {groundspeedKt: 120, trackTrue: dtk});
    await vi.advanceTimersByTimeAsync(3000);
    expect(unit.errors).toEqual([]);
    return unit;
}

/** MOD 1: the pilot selects 1 NM full scale (5-37) */
async function selectOneNm(unit: HeadlessUnit): Promise<void> {
    await unit.panel.selectPage('L', 'MOD 1');
    await vi.advanceTimersByTimeAsync(1000);
    await unit.panel.cursor('L');
    await unit.panel.inner('L', -1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(nm(unit, 'GPS CDI SCALING')).toBeCloseTo(1, 6); // Precondition: 1 NM full scale
}

/** GPS WP CROSS TRK with the uncalibrated gain and zero point: the EEPROM read failed */
function expectUncalibrated(unit: HeadlessUnit): void {
    const xtk = nm(unit, 'L:KLN90B_XTK');
    const scale = nm(unit, 'GPS CDI SCALING');
    expect(Math.abs(nm(unit, 'GPS WP CROSS TRK') - (GAIN * -xtk + ZERO_SHARE * scale))).toBeLessThan(0.01);
}

/** GPS WP CROSS TRK as the unit means it: the opposite of L:KLN90B_XTK */
function expectCalibrated(unit: HeadlessUnit): void {
    expect(Math.abs(nm(unit, 'GPS WP CROSS TRK') + nm(unit, 'L:KLN90B_XTK'))).toBeLessThan(0.01);
}

/** Runs the check after every display tick for the given seconds */
async function watch(seconds: number, check: () => void): Promise<void> {
    for (let i = 0; i < seconds * 4; i++) {
        await vi.advanceTimersByTimeAsync(250);
        check();
    }
}

/** A power cycle of a second (the unit's knob) up to the Self Test page, after the Turn-On page (3-3) */
async function powerCycleToSelfTest(unit: HeadlessUnit): Promise<void> {
    await unit.panel.powerCycle();
    await vi.advanceTimersByTimeAsync(19_000); // As bootToSelfTest: the Turn-On page shows for 17 s
    expect(Screen.read().rows('R').some(r => r.trim() === 'APPROVE?')).toBe(true); // Precondition: the Self Test page
}

/** A power cycle up to one calculation tick after the first navigation page */
async function powerCycle(unit: HeadlessUnit): Promise<void> {
    await powerCycleToSelfTest(unit);
    await unit.panel.approveSelfTest();
    await vi.advanceTimersByTimeAsync(1100);
}

/** What the last row of the left Self Test page shows over two seconds: TEST FAIL (which flashes, 3-4) or ANNUN ON */
async function annunciatorRow(): Promise<string[]> {
    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) {
        seen.add(Screen.read().rows('L')[5]);
        await vi.advanceTimersByTimeAsync(250);
    }
    return [...seen].filter(r => r.trim() !== '').sort();
}

/** The two lines of the EEPROM message */
const EEPROM_MESSAGE = [['EEPROM FAILURE: IC1045', 'EXTERNAL D-BAR INVALID']];

/**
 * An engine-running boot with the GPS settled: en route, no flight plan, so no active waypoint. The stored last position
 * is the present one, so the message list holds no POSITION DIFFERS FROM LAST POSITION
 */
async function enRoute(storage: Record<string, unknown> = {}): Promise<HeadlessUnit> {
    const unit = await bootUnit({
        position: POSITION,
        storage: {lastLatitude: POSITION.lat, lastLongitude: POSITION.lon, ...CALIBRATION, ...storage},
    });
    await settle(unit);
    return unit;
}

describe('the EEPROM failure (#459)', () => {
    it('the external deviation carries the uncalibrated gain and zero point', async () => {
        const unit = await offCourse(failed('eeprom'));
        await untilCalcTick(unit);

        expect(Math.abs(nm(unit, 'L:KLN90B_XTK'))).toBeGreaterThan(0.4); // Precondition: off the leg
        expect(nm(unit, 'GPS CDI SCALING')).toBeCloseTo(5, 6);
        expectUncalibrated(unit);
        expect(unit.errors).toEqual([]);
    }, 30_000);

    // The zero point is a share of full scale, so it follows the CDI scale the pilot selects on MOD 1 (5-37)
    it('the zero point follows the CDI scale', async () => {
        const unit = await offCourse(failed('eeprom'));
        await selectOneNm(unit);
        await vi.advanceTimersByTimeAsync(3000);

        const xtk = nm(unit, 'L:KLN90B_XTK');
        expect(Math.abs(xtk)).toBeGreaterThan(0.4); // Precondition: off the leg
        expect(Math.abs(nm(unit, 'GPS WP CROSS TRK') - (GAIN * -xtk + ZERO_SHARE * 1))).toBeLessThan(0.01);
        expect(unit.errors).toEqual([]);
    }, 30_000);

    // The signal tick takes the full scale the calculation tick has just set, so the zero point moves with the scale
    // write, not a calculation tick later
    it('the zero point follows a change of the CDI scale at once', async () => {
        const unit = await offCourse(failed('eeprom'));
        await vi.advanceTimersByTimeAsync(5000);
        const mark = unit.env.sim.writes.length;

        await selectOneNm(unit);

        const writes = unit.env.sim.writes.slice(mark);
        const scaleWrite = writes.findIndex(w => w.name === 'GPS CDI SCALING' && Math.abs((w.value as number) - 1852) < 1);
        expect(scaleWrite).toBeGreaterThanOrEqual(0); // Precondition: the scale changed
        const after = writes.slice(scaleWrite).filter(w => w.name === 'GPS WP CROSS TRK').map(w => (w.value as number) / 1852);
        expect(after.length).toBeGreaterThan(16); // Precondition: more than a second of signal ticks
        // On 1 NM the filtered deviation moves from 0.1 to 0.5 full scales, |filtered| <= 0.5 NM, so 1.2 × filtered +
        // 0.4 × 1 NM lies within 0.4 ± 0.6. The zero point on 5 NM (2 NM) would put it at 1.4 or more
        expect(after.filter(v => v < -0.21 || v > 1.01)).toEqual([]);
        expect(unit.errors).toEqual([]);
    }, 30_000);

    it('the zero point also shows while the deviation is flagged', async () => {
        const unit = await enRoute(failed('eeprom'));
        expect(nm(unit, 'L:KLN90B_XTK')).toBe(0); // Precondition: no active waypoint
        expect(nm(unit, 'GPS CDI SCALING')).toBeCloseTo(5, 6);

        expect(Math.abs(nm(unit, 'GPS WP CROSS TRK') - 2)).toBeLessThan(0.01); // 0.4 × 5 NM
        expect(unit.errors).toEqual([]);
    }, 30_000);

    it('a power-off writes 0', async () => {
        const unit = await offCourse(failed('eeprom'));
        await vi.advanceTimersByTimeAsync(5000);
        expect(Math.abs(nm(unit, 'GPS WP CROSS TRK'))).toBeGreaterThan(0.5); // Precondition

        await unit.panel.powerOff();
        const mark = unit.env.sim.writes.length;
        await vi.advanceTimersByTimeAsync(3000);

        expect(nm(unit, 'GPS WP CROSS TRK')).toBe(0);
        expect(unit.env.sim.writes.slice(mark).filter(w => w.name === 'GPS WP CROSS TRK')).toEqual([]);
        expect(unit.errors).toEqual([]);
    }, 30_000);

    // A power change resets the full scale to 5 NM (SensorsOut.reset, VolatileMemory), so the zero point is on 5 NM from
    // the first signal tick on, not on the scale of before the power-off until the first calculation tick
    it('after a power-on the zero point is on the reset full scale', async () => {
        const unit = await offCourse(failed('eeprom'));
        await selectOneNm(unit);
        await vi.advanceTimersByTimeAsync(3000);
        await unit.panel.powerOff();
        await vi.advanceTimersByTimeAsync(2000); // The filter's capacitor discharges

        const mark = unit.env.sim.writes.length;
        await unit.panel.powerOn();
        await vi.advanceTimersByTimeAsync(900); // Before the first calculation tick

        const written = unit.env.sim.writes.slice(mark).filter(w => w.name === 'GPS WP CROSS TRK');
        expect(written.every(w => w.unit.toLowerCase() === 'meters')).toBe(true); // Precondition: the unit converted below
        const values = written.map(w => (w.value as number) / 1852);
        const deviations = values.filter(v => v !== 0); // The null state of the power change writes 0
        expect(deviations.length).toBeGreaterThan(5); // Precondition: the 16 Hz ticks wrote
        expect(deviations.filter(v => Math.abs(v - 2) >= 0.01)).toEqual([]); // 0.4 × 5 NM
        expect(unit.errors).toEqual([]);
    }, 30_000);

    it('the screen is shifted while the read has failed, the FLR pages included', async () => {
        const unit = await enRoute(failed('eeprom'));

        expect(transform()).toBe(SHIFT);
        await openFlr1(unit);
        expect(rows()[5]).toBe('SERVICE?'); // Precondition: FLR 1 shows
        expect(transform()).toBe(SHIFT);
        expect(unit.errors).toEqual([]);
    }, 30_000);

    // The style is set only when the shift changes, which is at a power-on whose read gives another result
    it('the screen transform is written at the power-on after the failure and at the one after the repair, never otherwise', async () => {
        const unit = await enRoute();
        const writes: string[] = [];
        const container = document.getElementById('pageContainer')!;
        const observer = new MutationObserver(records => {
            records.forEach(() => writes.push(container.style.transform));
        });
        observer.observe(container, {attributes: true, attributeFilter: ['style']});
        const flush = async () => {
            await vi.advanceTimersByTimeAsync(0);
            writes.push(...observer.takeRecords().map(() => container.style.transform));
        };

        await vi.advanceTimersByTimeAsync(2000); // Eight display ticks with nothing failed
        unit.props.failures.fail('eeprom');
        await vi.advanceTimersByTimeAsync(2000);
        await flush();
        expect(writes).toEqual([]);

        await powerCycle(unit);
        await flush();
        expect(writes).toEqual([SHIFT]);

        unit.props.failures.repair('eeprom');
        await vi.advanceTimersByTimeAsync(2000);
        await flush();
        expect(writes).toEqual([SHIFT]);

        await powerCycle(unit);
        await flush();
        expect(writes).toEqual([SHIFT, '']);
        observer.disconnect();
        expect(unit.errors).toEqual([]);
    }, 60_000);

    it('the error pages are not shifted', async () => {
        const unit = await bootUnit({storage: {...CALIBRATION, ...failed('eeprom')}});
        await vi.advanceTimersByTimeAsync(250); // One display tick
        expect(transform()).toBe(SHIFT); // Precondition: the unit's screen is shifted

        for (const selector of ['.errorpage', '.panelxmlerrorpage']) {
            const page = document.querySelector<HTMLElement>(selector);
            expect(page, selector).not.toBeNull(); // Precondition: the element exists
            // Neither the page nor anything around it up to the body moves
            const transforms: string[] = [];
            for (let el: HTMLElement | null = page; el !== null && el !== document.body; el = el.parentElement) {
                transforms.push(el.style.transform);
            }
            expect(transforms.length, selector).toBeGreaterThan(1); // Precondition: the walk went past the page itself
            expect(transforms.filter(t => t !== ''), selector).toEqual([]);
        }
        expect(unit.errors).toEqual([]);
    }, 30_000);

    // The session's first power-on, from cold and dark, reads the failure an earlier session stored
    it('messages and TEST FAIL', async () => {
        const unit = await bootToSelfTest({storage: {...CALIBRATION, ...failed('eeprom')}});
        expect(Screen.read().rows('L')[5]).toBe('TEST FAIL  ');
        expect(transform()).toBe(SHIFT);
        expect(eepromMessages(unit)).toEqual([]);

        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(1100); // One calculation tick after the main page

        expect(eepromMessages(unit)).toEqual(EEPROM_MESSAGE);
        expect(unit.errors).toEqual([]);
    }, 30_000);

    // The session's first power-on, an engine-running start, reads the failure an earlier session stored
    it('an engine-running start reads the stored failure', async () => {
        const unit = await offCourse(failed('eeprom'));

        expect(transform()).toBe(SHIFT);
        expect(eepromMessages(unit)).toEqual(EEPROM_MESSAGE);
        expectUncalibrated(unit);
        expect(unit.errors).toEqual([]);
    }, 30_000);

    // The calibration is never drawn again: a repair is a new EEPROM calibrated at the shop (docs/failures.md, "EEPROM")
    it('the same values after a repair and a second failure', async () => {
        const unit = await offCourse(failed('eeprom'));
        const failures = unit.props.failures;
        const firstDeviation = nm(unit, 'GPS WP CROSS TRK');
        expect(transform()).toBe(SHIFT); // Precondition: the failure shows

        failures.repair('eeprom');
        await powerCycle(unit);
        await vi.advanceTimersByTimeAsync(3000);
        expect(transform()).toBe(''); // Precondition: the repair shows
        expect(Math.abs(nm(unit, 'GPS WP CROSS TRK') - firstDeviation)).toBeGreaterThan(0.5);

        failures.fail('eeprom');
        await powerCycle(unit);
        await vi.advanceTimersByTimeAsync(3000);

        expect(transform()).toBe(SHIFT);
        expect(Math.abs(nm(unit, 'GPS WP CROSS TRK') - firstDeviation)).toBeLessThan(0.01);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    it('nothing failed: GPS WP CROSS TRK as today', async () => {
        const unit = await offCourse();
        await vi.advanceTimersByTimeAsync(5000);

        const xtk = nm(unit, 'L:KLN90B_XTK');
        expect(Math.abs(xtk)).toBeGreaterThan(0.4); // Precondition: off the leg
        expect(Math.abs(nm(unit, 'GPS WP CROSS TRK') + xtk)).toBeLessThan(0.01);
        expect(transform()).toBe('');
        expect(unit.errors).toEqual([]);
    }, 30_000);
});

// The maintainer's decision of 2026-11-05 (docs/failures.md, "EEPROM"): the unit reads the calibration from the EEPROM
// at a power-on only and keeps it in RAM, so a failure or a repair in operation shows nothing until the next power-on
describe('the EEPROM is read at power-on only (#459)', () => {
    it('a failure in operation shows nothing until the next power-on', async () => {
        const unit = await offCourse();
        await untilCalcTick(unit);
        expect(Math.abs(nm(unit, 'L:KLN90B_XTK'))).toBeGreaterThan(0.4); // Precondition: off the leg

        unit.props.failures.fail('eeprom');
        await watch(5, () => {
            expect(transform()).toBe('');
            expectCalibrated(unit);
            expect(eepromMessages(unit)).toEqual([]);
        });

        await powerCycleToSelfTest(unit);
        expect(await annunciatorRow()).toEqual(['TEST FAIL  ']);
        expect(transform()).toBe(SHIFT);
        expect(eepromMessages(unit)).toEqual([]); // Detection starts with the first navigation page

        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(1100);
        expect(eepromMessages(unit)).toEqual(EEPROM_MESSAGE);
        await vi.advanceTimersByTimeAsync(3000);
        expectUncalibrated(unit);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // The Self Test page decides TEST FAIL when it is built, after the read of the power-on: a failure in between, which
    // the MTBF trigger can cause while the Turn-On page shows, belongs to the next power-on
    it('a failure during the Turn-On page waits for the next power-on', async () => {
        const unit = await enRoute();
        await unit.panel.powerCycle();
        await vi.advanceTimersByTimeAsync(5000);
        expect(Screen.read().text()).not.toContain('APPROVE?'); // Precondition: the Turn-On page shows

        unit.props.failures.fail('eeprom');
        await vi.advanceTimersByTimeAsync(14_000);
        expect(Screen.read().rows('R').some(r => r.trim() === 'APPROVE?')).toBe(true); // Precondition: the Self Test page
        expect(await annunciatorRow()).toEqual(['ANNUN    ON']);
        expect(transform()).toBe('');

        await unit.panel.approveSelfTest();
        await watch(3, () => {
            expect(eepromMessages(unit)).toEqual([]);
            expect(transform()).toBe('');
        });

        await powerCycleToSelfTest(unit);
        expect(await annunciatorRow()).toEqual(['TEST FAIL  ']);
        expect(transform()).toBe(SHIFT);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // The Self Test page of a power-on whose read failed keeps TEST FAIL after a repair while the Turn-On page shows
    it('a repair during the Turn-On page waits for the next power-on', async () => {
        const unit = await enRoute();
        unit.props.failures.fail('eeprom');
        await unit.panel.powerCycle();
        await vi.advanceTimersByTimeAsync(5000);
        expect(Screen.read().text()).not.toContain('APPROVE?'); // Precondition: the Turn-On page shows

        unit.props.failures.repair('eeprom');
        await vi.advanceTimersByTimeAsync(14_000);
        expect(Screen.read().rows('R').some(r => r.trim() === 'APPROVE?')).toBe(true); // Precondition: the Self Test page
        expect(await annunciatorRow()).toEqual(['TEST FAIL  ']);
        expect(transform()).toBe(SHIFT);

        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(1100); // One calculation tick after the main page
        await watch(3, () => {
            expect(eepromMessages(unit)).toEqual(EEPROM_MESSAGE);
            expect(transform()).toBe(SHIFT);
        });

        await powerCycleToSelfTest(unit);
        expect(await annunciatorRow()).toEqual(['ANNUN    ON']);
        expect(transform()).toBe('');
        expect(unit.errors).toEqual([]);
    }, 60_000);

    it('a repair in operation changes nothing until the next power-on', async () => {
        const unit = await offCourse(failed('eeprom'));
        expect(eepromMessages(unit)).toEqual(EEPROM_MESSAGE); // Precondition: the boot read the failure

        unit.props.failures.repair('eeprom');
        await watch(5, () => {
            expect(transform()).toBe(SHIFT);
            expectUncalibrated(unit);
            expect(eepromMessages(unit)).toEqual(EEPROM_MESSAGE);
        });

        await powerCycleToSelfTest(unit);
        expect(await annunciatorRow()).toEqual(['ANNUN    ON']);
        expect(transform()).toBe('');

        await unit.panel.approveSelfTest();
        await watch(3, () => {
            expect(eepromMessages(unit)).toEqual([]);
        });
        expectCalibrated(unit);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    it('SERVICE? changes nothing until the next power-on', async () => {
        const unit = await enRoute(failed('eeprom'));
        expect(eepromMessages(unit)).toEqual(EEPROM_MESSAGE); // Precondition: the boot read the failure
        await openFlr1(unit);
        await unit.panel.cursor('L');
        await unit.panel.cursorTo('L', 'SERVICE?');
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);
        await unit.panel.ent(); // CONFIRM?
        expect(unit.props.failures.activeList()).toEqual([]); // Precondition: serviced

        await watch(5, () => {
            expect(transform()).toBe(SHIFT);
            expect(Math.abs(nm(unit, 'GPS WP CROSS TRK') - 2)).toBeLessThan(0.01); // 0.4 × 5 NM, no active waypoint
            expect(eepromMessages(unit)).toEqual(EEPROM_MESSAGE);
        });

        await powerCycleToSelfTest(unit);
        expect(await annunciatorRow()).toEqual(['ANNUN    ON']);
        expect(transform()).toBe('');
        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(3000);
        expect(eepromMessages(unit)).toEqual([]);
        expect(Math.abs(nm(unit, 'GPS WP CROSS TRK'))).toBeLessThan(0.01); // No active waypoint, and no zero point
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // The read is part of the power event, so the first display tick and the first signal ticks of the power-on, before
    // the first calculation tick, already use it
    describe('the first ticks after a power-on', () => {
        /**
         * Off for two seconds, then on: the screen transform at the first display tick, and GPS WP CROSS TRK as written by
         * the signal ticks in the first 900 ms (before the first calculation tick), in NM
         */
        async function firstTicks(unit: HeadlessUnit): Promise<{ shift: string, crossTrack: number[] }> {
            await unit.panel.powerOff();
            await vi.advanceTimersByTimeAsync(2000);
            const mark = unit.env.sim.writes.length;
            await unit.panel.powerOn();
            await vi.advanceTimersByTimeAsync(250); // The first display tick
            const shift = transform();
            await vi.advanceTimersByTimeAsync(650);
            const written = unit.env.sim.writes.slice(mark).filter(w => w.name === 'GPS WP CROSS TRK');
            expect(written.every(w => w.unit.toLowerCase() === 'meters')).toBe(true); // Precondition: the unit converted below
            return {shift, crossTrack: written.map(w => (w.value as number) / 1852)};
        }

        it('after a failure in operation', async () => {
            const unit = await enRoute();
            unit.props.failures.fail('eeprom');
            await vi.advanceTimersByTimeAsync(2000);

            const {shift, crossTrack} = await firstTicks(unit);

            expect(shift).toBe(SHIFT);
            const deviations = crossTrack.filter(v => v !== 0); // The null state of the power change writes 0
            expect(deviations.length).toBeGreaterThan(5); // Precondition: the 16 Hz ticks wrote
            expect(deviations.filter(v => Math.abs(v - 2) >= 0.01)).toEqual([]); // 0.4 × 5 NM, no active waypoint
            expect(unit.errors).toEqual([]);
        }, 30_000);

        it('after a repair in operation', async () => {
            const unit = await enRoute(failed('eeprom'));
            unit.props.failures.repair('eeprom');
            await vi.advanceTimersByTimeAsync(2000);
            expect(Math.abs(nm(unit, 'GPS WP CROSS TRK') - 2)).toBeLessThan(0.01); // Precondition: still the failed read

            const {shift, crossTrack} = await firstTicks(unit);

            expect(shift).toBe('');
            expect(crossTrack.length).toBeGreaterThan(5); // Precondition: the 16 Hz ticks wrote
            expect(crossTrack.filter(v => Math.abs(v) >= 0.01)).toEqual([]); // No zero point, no active waypoint
            expect(unit.errors).toEqual([]);
        }, 30_000);
    });

    describe('a supply loss within the ride-through is no power-on (PowerSupply, #332)', () => {
        /** Powered through CIRCUIT ON:1, as SimVarSync.test.ts' onCircuit: the circuit comes on after the boot */
        async function onCircuit(storage: Record<string, unknown> = {}): Promise<HeadlessUnit> {
            const unit = await bootUnit({
                panelXml: panelXml({'Input.ElectricitySimVar': 'CIRCUIT ON:1'}),
                position: POSITION,
                storage: {lastLatitude: POSITION.lat, lastLongitude: POSITION.lon, ...CALIBRATION, ...storage},
            });
            await vi.advanceTimersByTimeAsync(3000); // Beyond the switch-over: off before the circuit comes on
            unit.env.sim.set('CIRCUIT ON:1', 'bool', true);
            await vi.advanceTimersByTimeAsync(2000);
            await unit.panel.approveSelfTest();
            await settle(unit);
            return unit;
        }

        /** A loss of 1 s, which the battery module carries (RIDE_THROUGH_TIME) */
        async function rideThrough(unit: HeadlessUnit): Promise<void> {
            const cycles = unit.props.userSettings.getSetting('powercycles').value;
            unit.env.sim.set('CIRCUIT ON:1', 'bool', false);
            await vi.advanceTimersByTimeAsync(1000);
            unit.env.sim.set('CIRCUIT ON:1', 'bool', true);
            await vi.advanceTimersByTimeAsync(500);
            expect(unit.props.userSettings.getSetting('powercycles').value).toBe(cycles); // Precondition: no power cycle
        }

        it('a failure in operation stays without effect', async () => {
            const unit = await onCircuit();
            unit.props.failures.fail('eeprom');
            await vi.advanceTimersByTimeAsync(2000);

            await rideThrough(unit);

            await watch(5, () => {
                expect(transform()).toBe('');
                expect(Math.abs(nm(unit, 'GPS WP CROSS TRK'))).toBeLessThan(0.01); // No active waypoint, and no zero point
                expect(eepromMessages(unit)).toEqual([]);
            });
            expect(unit.errors).toEqual([]);
        }, 60_000);

        it('a repair in operation stays without effect', async () => {
            const unit = await onCircuit(failed('eeprom'));
            expect(eepromMessages(unit)).toEqual(EEPROM_MESSAGE); // Precondition: the power-on read the failure
            unit.props.failures.repair('eeprom');
            await vi.advanceTimersByTimeAsync(2000);

            await rideThrough(unit);

            await watch(5, () => {
                expect(transform()).toBe(SHIFT);
                expect(Math.abs(nm(unit, 'GPS WP CROSS TRK') - 2)).toBeLessThan(0.01); // 0.4 × 5 NM
                expect(eepromMessages(unit)).toEqual(EEPROM_MESSAGE);
            });
            expect(unit.errors).toEqual([]);
        }, 60_000);
    });

    describe('a hot-swap disable and resume is no power-on (SimVarSync)', () => {
        async function disableAndResume(unit: HeadlessUnit): Promise<void> {
            unit.env.sim.set('L:KLN90B_Disabled', 'bool', true);
            await vi.advanceTimersByTimeAsync(2000);
            expect(unit.props.hardware.isDisabled).toBe(true); // Precondition: disabled
            unit.env.sim.set('L:KLN90B_Disabled', 'bool', false);
            await vi.advanceTimersByTimeAsync(1500); // The next poll of SimVarSync, then a calculation tick
            expect(unit.props.hardware.isDisabled).toBe(false); // Precondition: resumed
        }

        it('a failure in operation stays without effect', async () => {
            const unit = await enRoute();
            unit.props.failures.fail('eeprom');
            await vi.advanceTimersByTimeAsync(2000);

            await disableAndResume(unit);

            await watch(5, () => {
                expect(transform()).toBe('');
                expect(Math.abs(nm(unit, 'GPS WP CROSS TRK'))).toBeLessThan(0.01); // No active waypoint, and no zero point
                expect(eepromMessages(unit)).toEqual([]);
            });
            expect(unit.errors).toEqual([]);
        }, 60_000);

        it('a repair in operation stays without effect', async () => {
            const unit = await enRoute(failed('eeprom'));
            expect(eepromMessages(unit)).toEqual(EEPROM_MESSAGE); // Precondition: the boot read the failure
            unit.props.failures.repair('eeprom');
            await vi.advanceTimersByTimeAsync(2000);

            await disableAndResume(unit);

            await watch(5, () => {
                expect(transform()).toBe(SHIFT);
                expect(Math.abs(nm(unit, 'GPS WP CROSS TRK') - 2)).toBeLessThan(0.01); // 0.4 × 5 NM
                expect(eepromMessages(unit)).toEqual(EEPROM_MESSAGE);
            });
            expect(unit.errors).toEqual([]);
        }, 60_000);
    });
});
