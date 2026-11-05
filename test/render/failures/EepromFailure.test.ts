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
 * docs/superpowers/specs/2026-11-05-failures-lamps-superflag-eeprom-design.md, "The unit's EEPROM calibration" and "The
 * EEPROM"). The unit falls back to nominal values: the screen is off center by the stored centering, and GPS WP CROSS TRK
 * carries the gain and zero point of the stored D-bar calibration points
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
async function offCourse(): Promise<HeadlessUnit> {
    const {kaaa, abc} = standardRoute();
    const unit = await bootOnStandardRoute({panelXml: panelXml(BASE), simVars: SIM_VARS, magvar: 0, storage: CALIBRATION});
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
        const unit = await offCourse();
        await untilCalcTick(unit);
        const xtkBefore = nm(unit, 'L:KLN90B_XTK');
        expect(Math.abs(xtkBefore)).toBeGreaterThan(0.4); // Precondition: off the leg
        expect(Math.abs(nm(unit, 'GPS WP CROSS TRK') + xtkBefore)).toBeLessThan(0.01); // Precondition: as today

        unit.props.failures.fail('eeprom');
        await vi.advanceTimersByTimeAsync(5000);

        const xtk = nm(unit, 'L:KLN90B_XTK');
        const scale = nm(unit, 'GPS CDI SCALING');
        expect(Math.abs(xtk - xtkBefore)).toBeLessThan(0.01); // The digital cross track stays right
        expect(Math.abs(nm(unit, 'GPS WP CROSS TRK') - (GAIN * -xtk + ZERO_SHARE * scale))).toBeLessThan(0.01);
        expect(unit.errors).toEqual([]);
    }, 30_000);

    // The zero point is a share of full scale, so it follows the CDI scale the pilot selects on MOD 1 (5-37)
    it('the zero point follows the CDI scale', async () => {
        const unit = await offCourse();
        await selectOneNm(unit);

        unit.props.failures.fail('eeprom');
        await vi.advanceTimersByTimeAsync(5000);

        const xtk = nm(unit, 'L:KLN90B_XTK');
        expect(Math.abs(xtk)).toBeGreaterThan(0.4); // Precondition: off the leg
        expect(Math.abs(nm(unit, 'GPS WP CROSS TRK') - (GAIN * -xtk + ZERO_SHARE * 1))).toBeLessThan(0.01);
        expect(unit.errors).toEqual([]);
    }, 30_000);

    // The signal tick takes the full scale the calculation tick has just set, so the zero point moves with the scale
    // write, not a calculation tick later
    it('the zero point follows a change of the CDI scale at once', async () => {
        const unit = await offCourse();
        unit.props.failures.fail('eeprom');
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
        const unit = await enRoute();
        expect(nm(unit, 'L:KLN90B_XTK')).toBe(0); // Precondition: no active waypoint
        expect(nm(unit, 'GPS CDI SCALING')).toBeCloseTo(5, 6);

        unit.props.failures.fail('eeprom');
        await vi.advanceTimersByTimeAsync(5000);

        expect(Math.abs(nm(unit, 'GPS WP CROSS TRK') - 2)).toBeLessThan(0.01); // 0.4 × 5 NM
        expect(unit.errors).toEqual([]);
    }, 30_000);

    it('a power-off writes 0', async () => {
        const unit = await offCourse();
        unit.props.failures.fail('eeprom');
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
        const unit = await offCourse();
        await selectOneNm(unit);
        unit.props.failures.fail('eeprom');
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

    it('the screen shifts while failed', async () => {
        const unit = await enRoute();
        expect(transform()).toBe(''); // Precondition: centered
        const before = Screen.read().text();

        unit.props.failures.fail('eeprom');
        expect(transform()).toBe(''); // Input changes no DOM: only the display tick does
        await vi.advanceTimersByTimeAsync(250); // One display tick

        expect(transform()).toBe(SHIFT);
        expect(Screen.read().text()).toBe(before);

        await openFlr1(unit);
        expect(rows()[5]).toBe('SERVICE?'); // Precondition: FLR 1 shows
        expect(transform()).toBe(SHIFT);

        unit.props.failures.repair('eeprom');
        await vi.advanceTimersByTimeAsync(250);
        expect(transform()).toBe('');
        expect(unit.errors).toEqual([]);
    }, 30_000);

    it('the screen transform is written once at the failure and once at the repair, never otherwise', async () => {
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
        await flush();
        expect(writes).toEqual([]);

        unit.props.failures.fail('eeprom');
        await vi.advanceTimersByTimeAsync(2000);
        await flush();
        expect(writes).toEqual([SHIFT]);

        unit.props.failures.repair('eeprom');
        await vi.advanceTimersByTimeAsync(2000);
        await flush();
        expect(writes).toEqual([SHIFT, '']);
        observer.disconnect();
    }, 30_000);

    it('the error pages are not shifted', async () => {
        const unit = await bootUnit({storage: CALIBRATION});
        unit.props.failures.fail('eeprom');
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

    it('messages and TEST FAIL', async () => {
        const unit = await bootToSelfTest({storage: {...CALIBRATION, ...failed('eeprom')}});
        expect(Screen.read().rows('L')[5]).toBe('TEST FAIL  ');
        expect(eepromMessages(unit)).toEqual([]);

        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(1100); // One calculation tick after the main page

        expect(eepromMessages(unit)).toEqual([['EEPROM FAILURE: IC1045', 'EXTERNAL D-BAR INVALID']]);
        expect(unit.errors).toEqual([]);
    }, 30_000);

    // The calibration is never drawn again: a repair is a new EEPROM calibrated at the shop (docs/failures.md, "EEPROM")
    it('the same values after a repair and a second failure', async () => {
        const unit = await offCourse();
        const failures = unit.props.failures;
        failures.fail('eeprom');
        await vi.advanceTimersByTimeAsync(5000);
        const firstTransform = transform();
        const firstDeviation = nm(unit, 'GPS WP CROSS TRK');
        expect(firstTransform).toBe(SHIFT); // Precondition: the failure shows

        failures.repair('eeprom');
        await vi.advanceTimersByTimeAsync(5000);
        expect(transform()).toBe(''); // Precondition: the repair shows
        expect(Math.abs(nm(unit, 'GPS WP CROSS TRK') - firstDeviation)).toBeGreaterThan(0.5);

        failures.fail('eeprom');
        await vi.advanceTimersByTimeAsync(5000);

        expect(transform()).toBe(SHIFT);
        expect(Math.abs(nm(unit, 'GPS WP CROSS TRK') - firstDeviation)).toBeLessThan(0.01);
        expect(unit.errors).toEqual([]);
    }, 30_000);

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
